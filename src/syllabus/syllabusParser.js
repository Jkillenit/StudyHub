export function parseSyllabus(text) {
  const source = String(text || "");
  return {
    grading: extractGrading(source),
    gradingScale: extractGradingScale(source),
    attendance: extractAttendancePolicy(source),
  };
}

function extractGrading(text) {
  const components = [];
  const seen = new Set();
  const percentPattern = /^(.{2,50}?)\s{2,}(\d{1,3})\s*%/gm;
  let match;

  while ((match = percentPattern.exec(text)) !== null) {
    const name = cleanComponentName(match[1]);
    const weight = parseInt(match[2], 10);
    if (isValidComponent(name, weight, seen)) {
      seen.add(name.toLowerCase());
      components.push({
        name,
        weight: weight / 100,
        category: inferCategory(name),
      });
    }
  }

  if (components.length === 0) {
    const altPattern = /([A-Za-z][A-Za-z\s]{1,40}?)[\s:]+\(?(\d{1,3})\s*%\)?/g;
    while ((match = altPattern.exec(text)) !== null) {
      const name = cleanComponentName(match[1]);
      const weight = parseInt(match[2], 10);
      if (isValidComponent(name, weight, seen)) {
        seen.add(name.toLowerCase());
        components.push({
          name,
          weight: weight / 100,
          category: inferCategory(name),
        });
      }
    }
  }

  if (components.length === 0) {
    const pointsPattern = /^(.{2,50}?)\s{2,}(\d+)\s*(?:points?|pts?)/gim;
    const pointsItems = [];
    let totalPoints = 0;
    while ((match = pointsPattern.exec(text)) !== null) {
      const name = cleanComponentName(match[1]);
      const pts = parseInt(match[2], 10);
      if (name.length > 1 && pts > 0) {
        pointsItems.push({ name, pts });
        totalPoints += pts;
      }
    }
    if (pointsItems.length > 0 && totalPoints > 0) {
      pointsItems.forEach((component) => {
        const key = component.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          components.push({
            name: component.name,
            weight: component.pts / totalPoints,
            category: inferCategory(component.name),
            pointBased: true,
            points: component.pts,
          });
        }
      });
    }
  }

  const total = components.reduce((sum, component) => sum + component.weight, 0);
  if (total > 0.9 && total < 1.15 && Math.abs(total - 1.0) > 0.01) {
    components.forEach((component) => {
      component.weight = component.weight / total;
    });
  }

  return components;
}

function cleanComponentName(raw) {
  return String(raw || "")
    .replace(/[:\-–—]+$/, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\d.)]+\s*/, "")
    .trim();
}

function isValidComponent(name, weight, seen) {
  if (!name || name.length < 2) return false;
  if (weight <= 0 || weight > 100) return false;
  if (seen.has(name.toLowerCase())) return false;
  const noise = [
    "total",
    "grade",
    "final grade",
    "course grade",
    "points",
    "percentage",
    "grading",
    "weight",
    "assessment",
  ];
  if (noise.includes(name.toLowerCase())) return false;
  return true;
}

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/exam|midterm|final|test/.test(n)) return "exam";
  if (/quiz|quizzes/.test(n)) return "quiz";
  if (/homework|hw|assignment|problem set/.test(n)) return "homework";
  if (/project|paper|essay|report/.test(n)) return "project";
  if (/lab|laboratory/.test(n)) return "lab";
  if (/participation|attendance|engage/.test(n)) return "participation";
  return "other";
}

function extractGradingScale(text) {
  const scale = {};
  const patterns = [/([ABCDF][+-]?)\s*[=:]\s*(\d{2,3})/g, /([ABCDF][+-]?)\s+(\d{2,3})\s*[-–]/g];
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const letter = match[1].toUpperCase();
      const threshold = parseInt(match[2], 10);
      if (!scale[letter] && threshold >= 50 && threshold <= 100) {
        scale[letter] = threshold;
      }
    }
  });
  if (Object.keys(scale).length === 0) {
    return { A: 90, B: 80, C: 70, D: 60 };
  }
  return scale;
}

function extractAttendancePolicy(text) {
  const patterns = [
    /(?:may|can)\s+miss\s+(?:up\s+to\s+)?(\d+)\s+class/i,
    /more\s+than\s+(\d+)\s+(?:unexcused\s+)?absences?/i,
    /(\d+)\s+(?:unexcused\s+)?absences?\s+(?:are\s+)?(?:allowed|permitted)/i,
    /after\s+(\d+)\s+absences?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const max = parseInt(match[1], 10);
      if (max > 0 && max < 30) {
        return {
          maxAbsences: max,
          penaltyType: inferPenaltyType(text),
        };
      }
    }
  }
  return null;
}

function inferPenaltyType(text) {
  const source = text.toLowerCase();
  if (/letter\s+grade|grade\s+reduc/.test(source)) return "letter_grade";
  if (/fail|failing|automatic\s+f/.test(source)) return "fail";
  if (/points?\s+deduct/.test(source)) return "points";
  return "grade_impact";
}
