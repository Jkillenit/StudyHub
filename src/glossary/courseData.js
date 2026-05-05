/**
 * Built-in course glossary — standalone data module (no UI).
 * Anchors `sectionId` match Final Review element ids (final-sec-*).
 */

export const FINAL_SECTION_IDS = {
  ch1: "final-sec-ch1",
  ch3: "final-sec-ch3",
  ch4: "final-sec-ch4",
  ch6: "final-sec-ch6",
  ch6s: "final-sec-ch6s",
  ch7: "final-sec-ch7",
  ch11: "final-sec-ch11",
  ch12: "final-sec-ch12",
  ch16: "final-sec-ch16",
};

/** @typedef {{ id: string, term: string, sectionId: string, hover: string, detail: string[] }} GlossaryEntry */

/** @type {GlossaryEntry[]} */
export const BUILTIN_GLOSSARY = [
  {
    id: "operations_management",
    term: "Operations management",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Designing and running the systems that produce goods and services.",
    detail: [
      "Operations management is the set of activities that creates value by transforming inputs (materials, labor, energy, information) into outputs customers want.",
      "It is one of the three primary business functions alongside marketing and finance/accounting. OM choices directly affect cost, quality, delivery, and flexibility — therefore competitiveness.",
    ],
  },
  {
    id: "productivity",
    term: "Productivity",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Output per unit of input; single-factor vs. multi-factor measures.",
    detail: [
      "Productivity compares outputs to inputs. It can rise when output increases, inputs decrease, or both.",
      "Single-factor productivity fixes all but one input (often labor hours). Multi-factor productivity relates output to a bundle of inputs and is closer to overall efficiency but harder to measure.",
      "Percentage change in productivity is (New − Old) ÷ Old. In services, measuring output is harder because quality and variety differ.",
    ],
  },
  {
    id: "mission_vs_strategy",
    term: "Mission vs. strategy",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Mission = why we exist; strategy = how we win.",
    detail: [
      "The mission states purpose and boundaries — who we serve and what value we provide.",
      "Strategy is the coordinated action plan to achieve the mission and build sustainable advantage (cost, differentiation, response). OM implements strategy through process, capacity, location, quality, and supply-chain decisions.",
    ],
  },
  {
    id: "competitive_advantage_three",
    term: "Three competitive strategies",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Differentiation, cost leadership, response — core ways to compete.",
    detail: [
      "Differentiation competes on uniqueness (quality, brand, features). Often needs flexible processes and strong quality systems.",
      "Cost leadership competes on lowest delivered cost — efficient processes, scale, and tight cost control.",
      "Response competes on speed, reliability, and flexibility — rapid delivery, customization, dependable schedules.",
    ],
  },
  {
    id: "product_life_cycle",
    term: "Product life cycle",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Introduction → growth → maturity → decline; OM priorities shift by stage.",
    detail: [
      "Introduction: low volume, design changes, focus on product and process refinement.",
      "Growth: rapid demand — capacity expansion, forecasting, scheduling become critical.",
      "Maturity: competition on cost and efficiency; lean inventory and continuous improvement dominate.",
      "Decline: harvest or exit; minimize investment and rationalize capacity.",
    ],
  },
  {
    id: "outsourcing",
    term: "Outsourcing",
    sectionId: FINAL_SECTION_IDS.ch1,
    hover: "Moving activities to external suppliers; trades cost vs. control.",
    detail: [
      "Outsourcing shifts work that was internal to vendors. Benefits can include lower cost, access to skills, and capital savings.",
      "Risks include loss of quality control, longer lead times, intellectual property exposure, and supply disruption. OM must manage supplier selection, contracts, and ongoing performance.",
    ],
  },
  {
    id: "project_phases",
    term: "Project phases (planning, scheduling, controlling)",
    sectionId: FINAL_SECTION_IDS.ch3,
    hover: "The three managerial focuses across a project life cycle.",
    detail: [
      "Planning defines objectives, scope, tasks, resources, and the baseline plan.",
      "Scheduling maps activities over time (often with network methods) and commits people and budgets.",
      "Controlling compares actuals to plan, triggers corrective action, and updates schedules and costs.",
    ],
  },
  {
    id: "critical_path",
    term: "Critical path",
    sectionId: FINAL_SECTION_IDS.ch3,
    hover: "Longest path of dependent activities — sets minimum project duration.",
    detail: [
      "In a network of activities with precedence, the critical path is the chain of jobs with zero total slack.",
      "Any delay on the critical path delays project completion; reducing project time usually requires shortening critical activities (\"crashing\").",
      "Early/late times (ES, EF, LS, LF) identify slack: non-critical work can slip within slack without changing the finish date.",
    ],
  },
  {
    id: "slack_time",
    term: "Slack time",
    sectionId: FINAL_SECTION_IDS.ch3,
    hover: "Delay possible for an activity without delaying the project end.",
    detail: [
      "Slack (float) is LS − ES or LF − EF for an activity. Critical path activities have slack of zero.",
      "Slack shows where you can absorb minor delays or level resources — but slack can hide interdependencies when multiple paths are near-critical.",
    ],
  },
  {
    id: "project_crashing",
    term: "Project crashing",
    sectionId: FINAL_SECTION_IDS.ch3,
    hover: "Spending more to shorten critical activities and reduce project duration.",
    detail: [
      "Crashing trades money for time on the critical path — overtime, more crews, expedited shipping, etc.",
      "Best practice: crash the least expensive critical activity per week saved first, then re-evaluate the path (the critical path can shift).",
    ],
  },
  {
    id: "forecasting_horizons",
    term: "Forecast horizons",
    sectionId: FINAL_SECTION_IDS.ch4,
    hover: "Short, medium, and long-range — different methods and uses.",
    detail: [
      "Short-range forecasts (often under a year) drive scheduling, staffing, and purchasing.",
      "Medium-range (months to a few years) supports sales planning, budgets, and capacity adjustments.",
      "Long-range (years) guides facilities, product development, and strategy — more uncertain; qualitative methods mix with quantitative.",
    ],
  },
  {
    id: "exponential_smoothing",
    term: "Exponential smoothing",
    sectionId: FINAL_SECTION_IDS.ch4,
    hover: "Ft = Ft−1 + α(At−1 − Ft−1) — weighted memory of past errors.",
    detail: [
      "Exponential smoothing updates the forecast with a fraction α of the most recent forecast error. α near 1 reacts fast; α near 0 smooths heavily.",
      "Needs little data storage and handles random demand well; extensions add trend and seasonality when patterns are systematic.",
    ],
  },
  {
    id: "moving_average",
    term: "Moving average",
    sectionId: FINAL_SECTION_IDS.ch4,
    hover: "Average of the last n periods — simple and transparent.",
    detail: [
      "A simple moving average forecasts the next period as the unweighted mean of recent actuals. More periods mean smoother forecasts but slower response to shifts.",
      "Weighted moving average gives higher weights to recent demand; weights should reflect the emphasis you want on recent history.",
    ],
  },
  {
    id: "mad",
    term: "Mean absolute deviation (MAD)",
    sectionId: FINAL_SECTION_IDS.ch4,
    hover: "Average absolute forecast error — common accuracy measure.",
    detail: [
      "MAD is the mean of |Actual − Forecast| across periods. It is easy to interpret in the units of demand.",
      "Compared to squared-error measures, MAD is less dominated by huge single errors and is widely used for method comparison.",
    ],
  },
  {
    id: "quality_costs",
    term: "Four costs of quality",
    sectionId: FINAL_SECTION_IDS.ch6,
    hover: "Prevention, appraisal, internal failure, external failure.",
    detail: [
      "Prevention costs avoid defects upfront — training, planning, robust design.",
      "Appraisal costs detect defects — inspection and testing.",
      "Internal failures occur before shipment — scrap and rework.",
      "External failures occur after shipment — worst cost to reputation — warranty, returns, liability.",
      "The classic insight: investing in prevention often reduces total quality cost dramatically.",
    ],
  },
  {
    id: "tqm",
    term: "Total Quality Management (TQM)",
    sectionId: FINAL_SECTION_IDS.ch6,
    hover: "Organization-wide commitment to continuous customer-focused improvement.",
    detail: [
      "TQM aligns everyone toward customer requirements and continuous improvement (often linked to tools like PDCA).",
      "It emphasizes employee involvement, supplier partnership, and prevention over inspection.",
    ],
  },
  {
    id: "six_sigma",
    term: "Six Sigma",
    sectionId: FINAL_SECTION_IDS.ch6,
    hover: "DMAIC methodology targeting ~3.4 DPMO — data-driven defect reduction.",
    detail: [
      "Six Sigma uses structured projects (often DMAIC: Define, Measure, Analyze, Improve, Control) to reduce variation.",
      "The statistical goal references very low defect rates relative to specification limits; success depends on measurement systems and sustained control plans.",
    ],
  },
  {
    id: "spc",
    term: "Statistical Process Control (SPC)",
    sectionId: FINAL_SECTION_IDS.ch6s,
    hover: "Control charts distinguish common vs. assignable variation.",
    detail: [
      "SPC plots sample statistics over time with control limits based on process variation.",
      "Points inside limits with random pattern → process is \"in control\" (common causes only). Assignable causes show as out-of-control signals — investigate and fix the process, not just the part.",
    ],
  },
  {
    id: "common_vs_assignable",
    term: "Common vs. assignable causes",
    sectionId: FINAL_SECTION_IDS.ch6s,
    hover: "Inherent process noise vs. special disruptions you can track down.",
    detail: [
      "Common (chance) causes are the natural small ups and downs of a stable process.",
      "Assignable (special) causes come from identifiable events — tool wear, bad material, setup error. The control chart helps flag when assignable causes are likely present.",
    ],
  },
  {
    id: "control_limits",
    term: "Control limits",
    sectionId: FINAL_SECTION_IDS.ch6s,
    hover: "Usually ±3σ from the process mean for the plotted statistic — not specs.",
    detail: [
      "Control limits describe process behavior; specification limits describe customer requirements — do not confuse them.",
      "Western Electric / run rules add sensitivity for patterns (trends, runs) even when points stay inside 3σ limits.",
    ],
  },
  {
    id: "process_focus",
    term: "Process focus vs. repetitive vs. product focus",
    sectionId: FINAL_SECTION_IDS.ch7,
    hover: "How specialized equipment, flow, and volume trade off.",
    detail: [
      "Process-focused (job shop) layouts group similar processes; highly flexible but longer paths and changeovers.",
      "Repetitive (module-oriented) assembly lines balance variety and efficiency through standardized modules.",
      "Product-focused (continuous) dedicates layout to one family at high volume — lowest unit cost but low flexibility.",
    ],
  },
  {
    id: "mass_customization",
    term: "Mass customization",
    sectionId: FINAL_SECTION_IDS.ch7,
    hover: "Deliver variety near mass-production cost via modular design and agile processes.",
    detail: [
      "Uses postponement, modular BOMs, and flexible automation so late-stage differentiation meets individual preferences.",
      "Requires tight coordination across design, operations, and supply chain.",
    ],
  },
  {
    id: "supply_chain_mgmt",
    term: "Supply chain management",
    sectionId: FINAL_SECTION_IDS.ch11,
    hover: "Integrating flows from suppliers through the firm to customers.",
    detail: [
      "SCM coordinates materials, information, and finances across tiers to improve total chain performance, not just local efficiency.",
      "Key tensions: efficiency vs. responsiveness, risk pooling vs. localization, outsourcing vs. control.",
    ],
  },
  {
    id: "bullwhip_effect",
    term: "Bullwhip effect",
    sectionId: FINAL_SECTION_IDS.ch11,
    hover: "Demand variability amplifies upstream — small consumer swings become large orders.",
    detail: [
      "Causes include batch ordering, forecast updating delays, rationing gaming, and price promotions.",
      "Mitigations: share demand data (POS visibility), smaller batches, stable pricing, shorter lead times, vendor-managed inventory concepts.",
    ],
  },
  {
    id: "eoq",
    term: "Economic Order Quantity (EOQ)",
    sectionId: FINAL_SECTION_IDS.ch12,
    hover: "Balances ordering/setup cost vs. holding cost for a stable demand rate.",
    detail: [
      "Classic EOQ assumes constant demand rate D, holding cost per unit per year H, and fixed order/setup cost S. Q* = √(2DS/H).",
      "It illustrates the trade-off: bigger orders reduce order frequency but increase average inventory.",
      "Limitations: uncertain demand, quantity discounts, and lumpy demand need extensions (safety stock, reorder point, quantity discount models).",
    ],
  },
  {
    id: "abc_analysis",
    term: "ABC analysis",
    sectionId: FINAL_SECTION_IDS.ch12,
    hover: "Classify SKUs by annual dollar volume to focus control effort.",
    detail: [
      "A items are few SKUs representing most annual dollars — tight control and accurate records.",
      "C items are many SKUs with small dollars — loose rules, periodic reviews. B sits in the middle.",
    ],
  },
  {
    id: "safety_stock",
    term: "Safety stock",
    sectionId: FINAL_SECTION_IDS.ch12,
    hover: "Buffer inventory protecting against demand and lead-time variability.",
    detail: [
      "Higher desired service levels or more variability in demand or lead time increases required safety stock.",
      "Trade-off: more safety stock improves fill rate but raises holding costs and obsolescence risk.",
    ],
  },
  {
    id: "lean_ops",
    term: "Lean operations",
    sectionId: FINAL_SECTION_IDS.ch16,
    hover: "Maximize value; relentlessly eliminate non-value-adding waste.",
    detail: [
      "Lean ties closely to JIT — smooth flow, small batches, built-in quality (jidoka), and workforce involvement.",
      "Success depends on stable processes, supplier reliability, and culture — not only inventory cuts.",
    ],
  },
  {
    id: "seven_wastes",
    term: "Seven wastes (muda)",
    sectionId: FINAL_SECTION_IDS.ch16,
    hover: "Overproduction, waiting, transport, inventory, motion, overprocessing, defects (+ unused talent in modern lists).",
    detail: [
      "Overproduction is often considered worst because it creates the other wastes by hiding problems behind excess WIP.",
      "Lean tools (5S, cellular layout, pull systems) attack these wastes systemically.",
    ],
  },
  {
    id: "five_s",
    term: "5S workplace organization",
    sectionId: FINAL_SECTION_IDS.ch16,
    hover: "Sort, Set in order, Shine, Standardize, Sustain — visual, disciplined workplace.",
    detail: [
      "5S reduces search time, improves safety, and exposes abnormalities. It is foundational for reliable flow and standards.",
      "Sustain means turning 5S into habits and audits — without it, the system backslides.",
    ],
  },
  {
    id: "kanban",
    term: "Kanban",
    sectionId: FINAL_SECTION_IDS.ch16,
    hover: "Visual signal that authorizes production or movement in a pull system.",
    detail: [
      "Cards, bins, or empty spaces trigger replenishment — limits WIP and ties output to actual consumption.",
      "Requires stable processes and quick changeovers to work without chronic stockouts.",
    ],
  },
];

/** @returns {Record<string, GlossaryEntry>} */
export function glossaryById() {
  return Object.fromEntries(BUILTIN_GLOSSARY.map((e) => [e.id, e]));
}

/**
 * Terms for inline glossary highlighting in notes — same entries as CONTENT definition cards
 * for this chapter (matches `sectionId` / Final Review routing).
 * @returns {{ term: string, definition: string }[]}
 */
export function getGlossaryTermsForChapter(chapterId) {
  const sectionId = FINAL_SECTION_IDS[chapterId];
  if (!sectionId) return [];
  return BUILTIN_GLOSSARY.filter((e) => e.sectionId === sectionId).map((e) => ({
    term: e.term,
    definition: e.hover,
  }));
}
