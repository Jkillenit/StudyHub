const { session, net } = require("electron");
const { assignmentKind } = require("./assignmentKind.cjs");

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

/** Numeric score from any of Blackboard's grade shapes (public v1/v2, Ultra internal); null if ungraded/exempt. */
function gradeScore(g) {
  if (!g || g.exempt) return null;
  for (const v of [g.score, g.displayGrade?.score, g.manualScore]) {
    if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) return Number(v);
  }
  const text = g.displayGrade?.text ?? g.text;
  if (text != null && /^\s*-?\d+(\.\d+)?\s*$/.test(String(text))) return Number(text);
  return null;
}

function gradeColumnId(g) {
  return g?.columnId || g?.gradebookColumnId || g?.column?.id || null;
}

/** The signed-in student's own grades, trying each endpoint Blackboard may allow for students. */
async function collectUserGrades(course, userId, columns) {
  const user = encodeURIComponent(userId);
  const attempts = [
    ["public-v2", `/learn/api/public/v2/courses/${course}/gradebook/users/${user}?limit=200`],
    ["public-v1", `/learn/api/public/v1/courses/${course}/gradebook/users/${user}?limit=200`],
    ["ultra", `/learn/api/v1/courses/${course}/gradebook/grades?userId=${user}&limit=200`],
  ];
  for (const [source, pathname] of attempts) {
    try {
      await sleep(REQUEST_GAP_MS);
      const rows = await getPaged(pathname, 300);
      if (rows.some((r) => gradeScore(r) != null && gradeColumnId(r))) return { source, rows };
    } catch {
      /* try the next endpoint */
    }
  }
  const rows = [];
  for (const column of columns.slice(0, 80)) {
    try {
      const g = await getJson(
        `/learn/api/public/v2/courses/${course}/gradebook/columns/${encodeURIComponent(column.id)}/users/${user}`
      );
      if (g) rows.push({ ...g, columnId: gradeColumnId(g) || column.id });
    } catch {
      /* ungraded columns 404 */
    }
    await sleep(120);
  }
  return { source: rows.some((r) => gradeScore(r) != null) ? "per-column" : "none", rows };
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

  let userGrades = { source: "none", rows: [] };
  try {
    userGrades = await collectUserGrades(course, await currentUserId(), visible);
  } catch {
    /* no grades readable */
  }
  const gradeByColumn = new Map(userGrades.rows.map((g) => [gradeColumnId(g), g]));

  const assignments = visible
    .filter((c) => c?.grading?.due)
    .map((c) => {
      const grade = gradeByColumn.get(c.id);
      const name = String(c.name || "");
      return {
        id: c.id,
        title: name,
        dueDate: c.grading.due,
        kind: assignmentKind(name),
        pointsPossible: Number(c.score?.possible) || null,
        score: gradeScore(grade),
        url: `${BB_ORIGIN}/ultra/courses/${bbCourseId}/grades`,
      };
    });

  const gradeItems = visible
    .map((c) => {
      const grade = gradeByColumn.get(c.id);
      return {
        id: c.id,
        name: c.name,
        score: gradeScore(grade),
        pointsPossible: Number(c.score?.possible) || null,
        gradedAt: grade?.exempt ? null : grade?.lastModified || grade?.modified || null,
        category: categoryById.get(c.gradebookCategoryId) || null,
      };
    })
    .filter((g) => g.score != null || g.pointsPossible);

  return {
    assignments,
    gradeItems,
    gradeSource: userGrades.source,
    scoredCount: gradeItems.filter((g) => g.score != null).length,
  };
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
 * Finds the course syllabus, cheapest source first: an uploaded file or document titled "syllabus",
 * a syllabus already open in the Blackboard window, the course's syllabus tool tab (Simple Syllabus),
 * then a syllabus LTI link in the content list.
 */
async function findSyllabus(bbCourseId, contents, helpers = {}) {
  const { extractBufferText, readLtiText, readOpenSyllabus, readCourseSyllabus } = helpers;
  const candidates = contents.filter((c) => SYLLABUS_RE.test(c.title));
  const lti = candidates.filter((c) => isLtiHandler(c.handler));
  const files = candidates.filter((c) => !isLtiHandler(c.handler) && c.kind !== "folder");
  const ok = (text) => text && text.length >= MIN_SYLLABUS_CHARS;

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
  if (readOpenSyllabus) {
    const text = await readOpenSyllabus(bbCourseId);
    if (ok(text)) return { source: "open-page", title: "Syllabus", text };
  }
  if (readCourseSyllabus) {
    const text = await readCourseSyllabus(bbCourseId);
    if (ok(text)) return { source: "syllabus-tab", title: "Syllabus", text };
  }
  if (readLtiText && lti.length) {
    const text = await readLtiText(bbCourseId, lti[0].id);
    if (ok(text)) return { source: "simple-syllabus", title: lti[0].title, text };
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
  const { assignments, gradeItems, gradeSource, scoredCount } = await collectGradebook(bbCourseId);
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
    gradeSource,
    scoredCount,
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
