const { session, net } = require("electron");

const BB_PARTITION = "persist:blackboard";
const BB_ORIGIN = "https://ualearn.blackboard.com";
const REQUEST_GAP_MS = 250;
const MAX_CONTENT_ITEMS = 400;
const MAX_FOLDER_DEPTH = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Read-only GET as the logged-in student using the persisted Blackboard session. */
function getJson(pathname) {
  const bbSession = session.fromPartition(BB_PARTITION);
  return new Promise((resolve, reject) => {
    const request = net.request({ url: `${BB_ORIGIN}${pathname}`, session: bbSession, method: "GET" });
    request.setHeader("Accept", "application/json");
    const chunks = [];
    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(Object.assign(new Error(`HTTP ${response.statusCode}`), { status: response.statusCode }));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("Blackboard returned a non-JSON response (session may have expired)."));
        }
      });
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
      const kind = contentKind(item?.contentHandler?.id);
      out.push({
        id: item.id,
        parentId: parentId || null,
        title: item.title || "Untitled",
        kind,
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
  const visible = columns.filter((c) => c?.availability?.available !== "No" && !c?.externalGrade);

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
        score: grade?.score != null ? Number(grade.score) : null,
        pointsPossible: Number(c.score?.possible) || null,
        gradedAt: grade?.exempt ? null : grade?.lastModified || grade?.modified || null,
      };
    })
    .filter((g) => g.score != null || g.pointsPossible);

  return { assignments, gradeItems };
}

/** One full, read-only sweep of a single course. Each section fails independently. */
async function syncCourse(bbCourseId, onProgress = () => {}) {
  if (!/^_\d+_\d+$/.test(String(bbCourseId || ""))) throw new Error("Invalid Blackboard course id");
  onProgress({ step: "contents" });
  const contents = await collectContents(bbCourseId);
  await sleep(REQUEST_GAP_MS);
  onProgress({ step: "announcements" });
  const announcements = await collectAnnouncements(bbCourseId);
  await sleep(REQUEST_GAP_MS);
  onProgress({ step: "grades" });
  const { assignments, gradeItems } = await collectGradebook(bbCourseId);
  return { contents, announcements, assignments, gradeItems };
}

function resetUserCache() {
  cachedUserId = null;
}

module.exports = { listEnrolledCourses, syncCourse, resetUserCache };
