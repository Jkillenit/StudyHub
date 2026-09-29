const { session, net } = require("electron");

const BB_PARTITION = "persist:blackboard";
const BB_ORIGIN = "https://ualearn.blackboard.com";
const REQUEST_GAP_MS = 250;
const MAX_CONTENT_ITEMS = 400;
const MAX_FOLDER_DEPTH = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let pageFetcher = null;

/**
 * Optional fallback that performs the GET from inside the open Blackboard page, for schools whose
 * session cookies are not accepted outside the page. `fn(pathname)` resolves `{ status, body }` or null.
 */
function setPageFetcher(fn) {
  pageFetcher = typeof fn === "function" ? fn : null;
}

function parseResponse(status, body) {
  if (status < 200 || status >= 300) throw Object.assign(new Error(`HTTP ${status}`), { status });
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Blackboard returned a non-JSON response (session may have expired).");
  }
}

async function getJson(pathname) {
  try {
    return await getJsonViaSession(pathname);
  } catch (err) {
    if ((err?.status === 401 || err?.status === 403) && pageFetcher) {
      const res = await pageFetcher(pathname);
      if (res) return parseResponse(res.status, res.body);
    }
    throw err;
  }
}

/** Read-only GET as the logged-in student using the persisted Blackboard session. */
function getJsonViaSession(pathname) {
  const bbSession = session.fromPartition(BB_PARTITION);
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: `${BB_ORIGIN}${pathname}`,
      session: bbSession,
      useSessionCookies: true,
      method: "GET",
    });
    request.setHeader("Accept", "application/json");
    request.setHeader("X-Requested-With", "XMLHttpRequest");
    const chunks = [];
    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        try {
          resolve(parseResponse(response.statusCode, Buffer.concat(chunks).toString("utf8")));
        } catch (err) {
          reject(err);
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024;

/** Binary GET (follows redirects) using the Blackboard session. */
function getBuffer(pathname) {
  const bbSession = session.fromPartition(BB_PARTITION);
  return new Promise((resolve, reject) => {
    const request = net.request({ url: `${BB_ORIGIN}${pathname}`, session: bbSession, useSessionCookies: true, method: "GET" });
    const chunks = [];
    let size = 0;
    request.on("response", (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { status: response.statusCode }));
        response.resume?.();
        return;
      }
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_DOWNLOAD_BYTES) {
          request.abort();
          reject(new Error("File too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function getPaged(pathname, maxItems = 500) {
  const out = [];
  let next = pathname;
  while (next && out.length < maxItems) {
    const page = await getJson(next);
    (page?.results || []).forEach((r) => out.push(r));
    next = page?.paging?.nextPage || null;
    if (next) await sleep(REQUEST_GAP_MS);
  }
  return out;
}

async function firstOk(paths, fn = getJson) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await fn(p);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("No endpoint succeeded");
}

let cachedUserId = null;
async function currentUserId() {
  if (cachedUserId) return cachedUserId;
  const me = await firstOk(["/learn/api/v1/users/me", "/learn/api/public/v1/users/me"]);
  cachedUserId = me?.id || null;
  if (!cachedUserId) throw new Error("Could not identify the signed-in Blackboard user.");
  return cachedUserId;
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contentKind(handlerId) {
  const id = String(handlerId || "");
  if (id.includes("folder")) return "folder";
  if (id.includes("file") || id.includes("document")) return "file";
  if (id.includes("assignment")) return "assignment";
  if (id.includes("asmt") || id.includes("test") || id.includes("assessment")) return "assessment";
  if (id.includes("externallink") || id.includes("link")) return "link";
  return "item";
}

async function listEnrolledCourses() {
  const userId = await currentUserId();
  const memberships = await getPaged(
    `/learn/api/public/v1/users/${encodeURIComponent(userId)}/courses?expand=course&limit=100`,
    300
  );
  return memberships
    .filter((m) => m?.course && m.course.availability?.available !== "No")
    .map((m) => ({
      bbCourseId: m.course.id,
      name: m.course.name || m.course.courseId || m.course.id,
      courseCode: m.course.courseId || "",
      termId: m.course.termId || "",
      lastAccessed: m.lastAccessed || null,
      role: m.courseRoleId || "Student",
    }))
    .filter((c) => /student/i.test(c.role));
}

async function collectContents(bbCourseId) {
  const course = encodeURIComponent(bbCourseId);
  const out = [];
  async function walk(parentId, depth) {
    if (out.length >= MAX_CONTENT_ITEMS || depth > MAX_FOLDER_DEPTH) return;
    const listPath = parentId
      ? `/learn/api/public/v1/courses/${course}/contents/${encodeURIComponent(parentId)}/children?limit=100`
      : `/learn/api/public/v1/courses/${course}/contents?limit=100`;
    let items = [];
    try {
      items = await getPaged(listPath, MAX_CONTENT_ITEMS);
    } catch {
      return;
    }
    for (const item of items) {
      if (out.length >= MAX_CONTENT_ITEMS) break;
      const handler = String(item?.contentHandler?.id || "");
      const kind = contentKind(handler);
      out.push({
        id: item.id,
        parentId: parentId || null,
        title: item.title || "Untitled",
        kind,
        handler,
        body: typeof item.body === "string" ? item.body : "",
        url: `${BB_ORIGIN}/ultra/courses/${bbCourseId}/outline`,
      });
      if (kind === "folder" || item?.hasChildren) {
        await sleep(REQUEST_GAP_MS);
        await walk(item.id, depth + 1);
      }
    }
  }
  await walk(null, 0);
  return out;
}

async function collectAnnouncements(bbCourseId) {
  const course = encodeURIComponent(bbCourseId);
  try {
    const items = await firstOk(
      [
        `/learn/api/public/v1/courses/${course}/announcements?limit=50`,
        `/learn/api/v1/courses/${course}/announcements?limit=50`,
      ],
      (p) => getPaged(p, 50)
    );
    return items.map((a) => ({
      id: a.id,
      title: a.title || "Announcement",
      body: stripHtml(a.body?.rawText || a.body?.displayText || a.body || ""),
      postedAt: a.availability?.duration?.start || a.created || a.modified || null,
    }));
  } catch {
    return [];
  }
}

async function collectGradebook(bbCourseId) {
  const course = encodeURIComponent(bbCourseId);
  let columns = [];
  try {
    columns = await getPaged(`/learn/api/public/v2/courses/${course}/gradebook/columns?limit=200`, 300);
  } catch {
    return { assignments: [], gradeItems: [] };
  }
  const visible = columns.filter(
    (c) => c?.availability?.available !== "No" && !c?.externalGrade && c?.grading?.type !== "Calculated"
  );

  let categoryById = new Map();
  try {
    await sleep(REQUEST_GAP_MS);
    const categories = await getPaged(`/learn/api/public/v1/courses/${course}/gradebook/categories?limit=100`, 100);
    categoryById = new Map(categories.map((cat) => [cat.id, cat.title || cat.displayTitle || ""]));
  } catch {
    /* categories are optional */
  }

  let userGrades = [];
  try {
    const userId = await currentUserId();
    await sleep(REQUEST_GAP_MS);
    userGrades = await getPaged(
      `/learn/api/public/v2/courses/${course}/gradebook/users/${encodeURIComponent(userId)}?limit=200`,
      300
    );
  } catch {
    userGrades = [];
  }
  const gradeByColumn = new Map(userGrades.map((g) => [g.columnId, g]));

  const assignments = visible
    .filter((c) => c?.grading?.due)
    .map((c) => {
      const grade = gradeByColumn.get(c.id);
      const name = String(c.name || "");
      return {
        id: c.id,
        title: name,
        dueDate: c.grading.due,
        kind: /exam|midterm|final|test|quiz/i.test(name) ? "exam" : "assignment",
        pointsPossible: Number(c.score?.possible) || null,
        score: grade?.score != null ? Number(grade.score) : null,
        url: `${BB_ORIGIN}/ultra/courses/${bbCourseId}/grades`,
      };
    });

  const gradeItems = visible
    .map((c) => {
      const grade = gradeByColumn.get(c.id);
      return {
        id: c.id,
        name: c.name,
        score: grade?.score != null && !grade?.exempt ? Number(grade.score) : null,
        pointsPossible: Number(c.score?.possible) || null,
        gradedAt: grade?.exempt ? null : grade?.lastModified || grade?.modified || null,
        category: categoryById.get(c.gradebookCategoryId) || null,
      };
    })
    .filter((g) => g.score != null || g.pointsPossible);

  return { assignments, gradeItems };
}

const SYLLABUS_RE = /syllab/i;
const SYLLABUS_FILE_EXT = /\.(pdf|docx|pptx|txt|html?)$/i;
const MIN_SYLLABUS_CHARS = 200;

function isLtiHandler(handler) {
  return /lti/i.test(String(handler || ""));
}

/** Text of the first attached syllabus file on a content item, or "". */
async function readAttachmentText(bbCourseId, contentId, extractBufferText) {
  const course = encodeURIComponent(bbCourseId);
  const content = encodeURIComponent(contentId);
  let attachments = [];
  try {
    attachments = (await getJson(`/learn/api/public/v1/courses/${course}/contents/${content}/attachments`))?.results || [];
  } catch {
    return "";
  }
  for (const att of attachments) {
    const match = String(att.fileName || "").match(SYLLABUS_FILE_EXT);
    if (!match) continue;
    try {
      await sleep(REQUEST_GAP_MS);
      const buf = await getBuffer(
        `/learn/api/public/v1/courses/${course}/contents/${content}/attachments/${encodeURIComponent(att.id)}/download`
      );
      const text = await extractBufferText(buf, match[1]);
      if (text && text.length >= MIN_SYLLABUS_CHARS) return text;
    } catch {
      /* try the next attachment */
    }
  }
  return "";
}

/**
 * Finds the course syllabus: an uploaded file or document titled "syllabus", then an LTI tool
 * (e.g. Simple Syllabus) via `readLtiText`, then any syllabus page already open in the Blackboard window.
 */
async function findSyllabus(bbCourseId, contents, { extractBufferText, readLtiText, readOpenSyllabus } = {}) {
  const candidates = contents.filter((c) => SYLLABUS_RE.test(c.title));
  const lti = candidates.filter((c) => isLtiHandler(c.handler));
  const files = candidates.filter((c) => !isLtiHandler(c.handler) && c.kind !== "folder");

  for (const item of files) {
    const bodyText = stripHtml(item.body);
    if (bodyText.length >= MIN_SYLLABUS_CHARS && /%/.test(bodyText)) {
      return { source: "document", title: item.title, text: bodyText };
    }
    if (extractBufferText) {
      const text = await readAttachmentText(bbCourseId, item.id, extractBufferText);
      if (text) return { source: "file", title: item.title, text };
    }
  }
  if (readLtiText) {
    for (const item of lti) {
      const text = await readLtiText(bbCourseId, item.id);
      if (text && text.length >= MIN_SYLLABUS_CHARS) return { source: "simple-syllabus", title: item.title, text };
    }
  }
  if (readOpenSyllabus) {
    const text = await readOpenSyllabus();
    if (text && text.length >= MIN_SYLLABUS_CHARS) return { source: "open-page", title: "Syllabus", text };
  }
  return null;
}

/** One full, read-only sweep of a single course. Each section fails independently. */
async function syncCourse(bbCourseId, onProgress = () => {}, helpers = {}) {
  if (!/^_\d+_\d+$/.test(String(bbCourseId || ""))) throw new Error("Invalid Blackboard course id");
  onProgress({ step: "contents" });
  const contents = await collectContents(bbCourseId);
  await sleep(REQUEST_GAP_MS);
  onProgress({ step: "announcements" });
  const announcements = await collectAnnouncements(bbCourseId);
  await sleep(REQUEST_GAP_MS);
  onProgress({ step: "grades" });
  const { assignments, gradeItems } = await collectGradebook(bbCourseId);
  onProgress({ step: "syllabus" });
  let syllabus = null;
  try {
    syllabus = await findSyllabus(bbCourseId, contents, helpers);
  } catch {
    syllabus = null;
  }
  return {
    contents: contents.map(({ body: _body, handler: _handler, ...rest }) => rest),
    announcements,
    assignments,
    gradeItems,
    syllabus,
  };
}

async function getCourseInfo(bbCourseId) {
  const c = await firstOk([
    `/learn/api/public/v3/courses/${encodeURIComponent(bbCourseId)}`,
    `/learn/api/public/v2/courses/${encodeURIComponent(bbCourseId)}`,
  ]);
  return { name: c?.name || c?.courseId || "", courseCode: c?.courseId || "", term: c?.termId || "" };
}

function resetUserCache() {
  cachedUserId = null;
}

module.exports = { listEnrolledCourses, syncCourse, resetUserCache, setPageFetcher, getCourseInfo };
