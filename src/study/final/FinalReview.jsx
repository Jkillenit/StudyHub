import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Stack from "react-bootstrap/Stack";
import { BulletList, Card as ContentCard, SLabel } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS, BUILTIN_GLOSSARY, GlossaryTerm, useGlossarySplit } from "../../glossary/index.js";

function JumpNav() {
  const links = [
    ["Ch 1–2", FINAL_SECTION_IDS.ch1],
    ["Ch 3", FINAL_SECTION_IDS.ch3],
    ["Ch 4", FINAL_SECTION_IDS.ch4],
    ["Ch 6", FINAL_SECTION_IDS.ch6],
    ["Ch 6s", FINAL_SECTION_IDS.ch6s],
    ["Ch 7", FINAL_SECTION_IDS.ch7],
    ["Ch 11", FINAL_SECTION_IDS.ch11],
    ["Ch 12", FINAL_SECTION_IDS.ch12],
    ["Ch 16", FINAL_SECTION_IDS.ch16],
    ["Key terms", "final-glossary-index"],
  ];
  return (
    <ContentCard title="Jump to section">
      <Stack direction="horizontal" gap={2} className="flex-wrap">
        {links.map(([label, hash]) => (
          <Button
            key={hash}
            variant="outline-primary"
            size="sm"
            className="py-1 px-2"
            onClick={() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {label}
          </Button>
        ))}
      </Stack>
    </ContentCard>
  );
}

function GlossaryIndexRows() {
  const { openTerm } = useGlossarySplit();
  const sorted = [...BUILTIN_GLOSSARY].sort((a, b) => a.term.localeCompare(b.term));

  return (
    <Stack gap={2}>
      {sorted.map((e) => (
        <Card key={e.id} id={`glossary-row-${e.id}`} className="bg-dark text-light border-secondary">
          <Card.Body className="py-3 px-3">
            <Button
              variant="link"
              className="p-0 mb-2 text-info text-decoration-none fw-semibold text-start"
              onClick={() => {
                openTerm(e.id);
                window.requestAnimationFrame(() => {
                  document.getElementById(`glossary-row-${e.id}`)?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                });
              }}
            >
              {e.term}
            </Button>
            <div className="small text-secondary" style={{ lineHeight: 1.55 }}>
              {e.hover}
            </div>
          </Card.Body>
        </Card>
      ))}
    </Stack>
  );
}

export default function FinalReview() {
  const S = FINAL_SECTION_IDS;

  return (
    <div>
      <ContentCard title="How to use this Final review">
        Key ideas from each module are summarized below. The same{" "}
        <strong className="text-light">highlighted glossary terms</strong> appear in the chapter modules. Hover for a quick
        definition, or click to open the split glossary (Exit or Esc to close). Use{" "}
        <strong className="text-light">Jump to section</strong> or the full term list at the bottom for deep dives.
      </ContentCard>

      <JumpNav />

      <SLabel id={S.ch1}>Chapters 1–2 · Operations & strategy</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "OM as one of three core business functions; productivity as output/input",
              "Mission vs. strategy; outsourcing trade-offs",
              "Competitive strategies: differentiation, cost leadership, response",
              "Product life cycle stages and shifting OM priorities",
            ]}
          />
        </ContentCard>
        <ContentCard>
          <GlossaryTerm id="operations_management" sectionId={S.ch1}>
            Operations management
          </GlossaryTerm>{" "}
          turns inputs into customer value through process and capacity choices. Track{" "}
          <GlossaryTerm id="productivity" sectionId={S.ch1}>
            productivity
          </GlossaryTerm>{" "}
          in the right units (labor vs. multifactor), and connect day-to-day work to the firm’s{" "}
          <GlossaryTerm id="mission_vs_strategy" sectionId={S.ch1}>
            mission and strategy
          </GlossaryTerm>
          . Competitive focus usually maps to one of the{" "}
          <GlossaryTerm id="competitive_advantage_three" sectionId={S.ch1}>
            three competitive strategies
          </GlossaryTerm>
          , while products move through the{" "}
          <GlossaryTerm id="product_life_cycle" sectionId={S.ch1}>
            product life cycle
          </GlossaryTerm>
          .{" "}
          <GlossaryTerm id="outsourcing" sectionId={S.ch1}>
            Outsourcing
          </GlossaryTerm>{" "}
          can cut cost but increases coordination and risk.
        </ContentCard>
      </div>

      <SLabel id={S.ch3}>Chapter 3 · Project management</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Planning → scheduling → controlling",
              "Network logic, ES/EF/LS/LF, slack",
              "Critical path = longest path; crashing least-cost critical work",
            ]}
          />
        </ContentCard>
        <ContentCard>
          Projects cycle through{" "}
          <GlossaryTerm id="project_phases" sectionId={S.ch3}>
            planning, scheduling, and controlling
          </GlossaryTerm>
          . The{" "}
          <GlossaryTerm id="critical_path" sectionId={S.ch3}>
            critical path
          </GlossaryTerm>{" "}
          sets project length; activities with{" "}
          <GlossaryTerm id="slack_time" sectionId={S.ch3}>
            slack
          </GlossaryTerm>{" "}
          can slip without delaying completion. To shorten duration, use{" "}
          <GlossaryTerm id="project_crashing" sectionId={S.ch3}>
            crashing
          </GlossaryTerm>{" "}
          on critical jobs where extra spending buys the most time saved.
        </ContentCard>
      </div>

      <SLabel id={S.ch4}>Chapter 4 · Forecasting</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Choose methods by horizon (short vs. medium vs. long)",
              "Moving average vs. exponential smoothing — responsiveness vs. stability",
              "Measure accuracy (e.g., MAD) and compare models fairly",
            ]}
          />
        </ContentCard>
        <ContentCard>
          Match the forecast to the{" "}
          <GlossaryTerm id="forecasting_horizons" sectionId={S.ch4}>
            planning horizon
          </GlossaryTerm>
          . Smooth recent demand with a{" "}
          <GlossaryTerm id="moving_average" sectionId={S.ch4}>
            moving average
          </GlossaryTerm>{" "}
          or tune responsiveness using{" "}
          <GlossaryTerm id="exponential_smoothing" sectionId={S.ch4}>
            exponential smoothing
          </GlossaryTerm>
          . Track error with measures like{" "}
          <GlossaryTerm id="mad" sectionId={S.ch4}>
            MAD
          </GlossaryTerm>{" "}
          to see which approach fits your demand pattern.
        </ContentCard>
      </div>

      <SLabel id={S.ch6}>Chapter 6 · Managing quality</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Four costs of quality — invest in prevention",
              "TQM: customer focus, involvement, continuous improvement",
              "Six Sigma / DMAIC mindset",
            ]}
          />
        </ContentCard>
        <ContentCard>
          Quality economics bundle into the{" "}
          <GlossaryTerm id="quality_costs" sectionId={S.ch6}>
            four costs of quality
          </GlossaryTerm>
          . Programs such as{" "}
          <GlossaryTerm id="tqm" sectionId={S.ch6}>
            TQM
          </GlossaryTerm>{" "}
          spread responsibility for improvement, while{" "}
          <GlossaryTerm id="six_sigma" sectionId={S.ch6}>
            Six Sigma
          </GlossaryTerm>{" "}
          projects attack variation with data.
        </ContentCard>
      </div>

      <SLabel id={S.ch6s}>Chapter 6s · Statistical process control</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Control charts vs. specification limits",
              "Common vs. assignable causes",
              "React to out-of-control signals — fix the process",
            ]}
          />
        </ContentCard>
        <ContentCard>
          <GlossaryTerm id="spc" sectionId={S.ch6s}>
            SPC
          </GlossaryTerm>{" "}
          distinguishes routine noise from signals:{" "}
          <GlossaryTerm id="common_vs_assignable" sectionId={S.ch6s}>
            common vs. assignable causes
          </GlossaryTerm>
          . Plot sample stats against{" "}
          <GlossaryTerm id="control_limits" sectionId={S.ch6s}>
            control limits
          </GlossaryTerm>{" "}
          to decide when to intervene.
        </ContentCard>
      </div>

      <SLabel id={S.ch7}>Chapter 7 · Process strategy</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Process vs. repetitive vs. product-focused layouts",
              "Trade-offs: flexibility, volume, cost",
              "Mass customization via modularity and postponement",
            ]}
          />
        </ContentCard>
        <ContentCard>
          Align process choice with volume and variety: compare{" "}
          <GlossaryTerm id="process_focus" sectionId={S.ch7}>
            process, repetitive, and product-focused
          </GlossaryTerm>{" "}
          systems. Push variety without sacrificing scale through{" "}
          <GlossaryTerm id="mass_customization" sectionId={S.ch7}>
            mass customization
          </GlossaryTerm>{" "}
          tactics.
        </ContentCard>
      </div>

      <SLabel id={S.ch11}>Chapter 11 · Supply chain</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "End-to-end coordination beats local optimization",
              "Information sharing dampens variability",
              "Bullwhip causes and fixes",
            ]}
          />
        </ContentCard>
        <ContentCard>
          <GlossaryTerm id="supply_chain_mgmt" sectionId={S.ch11}>
            Supply chain management
          </GlossaryTerm>{" "}
          aligns suppliers, internal operations, and customers. Demand distortion upstream is the{" "}
          <GlossaryTerm id="bullwhip_effect" sectionId={S.ch11}>
            bullwhip effect
          </GlossaryTerm>
          — counter it with transparency and smarter batching policies.
        </ContentCard>
      </div>

      <SLabel id={S.ch12}>Chapter 12 · Inventory</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "EOQ intuition: order/setup cost vs. holding cost",
              "ABC prioritization",
              "Safety stock vs. service level trade-off",
            ]}
          />
        </ContentCard>
        <ContentCard>
          Classical{" "}
          <GlossaryTerm id="eoq" sectionId={S.ch12}>
            EOQ
          </GlossaryTerm>{" "}
          balances setup and holding costs for stable demand. Classify SKUs with{" "}
          <GlossaryTerm id="abc_analysis" sectionId={S.ch12}>
            ABC analysis
          </GlossaryTerm>{" "}
          and buffer uncertainty with{" "}
          <GlossaryTerm id="safety_stock" sectionId={S.ch12}>
            safety stock
          </GlossaryTerm>{" "}
          where variability hurts service the most.
        </ContentCard>
      </div>

      <SLabel id={S.ch16}>Chapter 16 · Lean operations</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Key concepts to recall">
          <BulletList
            items={[
              "Lean = value maximization + waste elimination",
              "JIT pull, jidoka, stable processes",
              "Ohno’s wastes; 5S discipline; kanban signals",
            ]}
          />
        </ContentCard>
        <ContentCard>
          <GlossaryTerm id="lean_ops" sectionId={S.ch16}>
            Lean operations
          </GlossaryTerm>{" "}
          targets the{" "}
          <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
            seven wastes
          </GlossaryTerm>{" "}
          using visual{" "}
          <GlossaryTerm id="five_s" sectionId={S.ch16}>
            5S
          </GlossaryTerm>{" "}
          and pull controls like{" "}
          <GlossaryTerm id="kanban" sectionId={S.ch16}>
            kanban
          </GlossaryTerm>{" "}
          once the process is repeatable.
        </ContentCard>
      </div>

      <SLabel id="final-glossary-index">Key terms &amp; concepts — full glossary</SLabel>
      <div style={{ scrollMarginTop: 12 }}>
        <ContentCard title="Alphabetical list">
          Tap a term to open the glossary panel (same as links in the chapters above).
        </ContentCard>
        <GlossaryIndexRows />
      </div>
    </div>
  );
}
