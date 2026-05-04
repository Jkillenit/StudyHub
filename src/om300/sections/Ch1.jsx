import { BulletList, Card, FormulaBox, Grid2, NumList, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch1() {
  return (
    <div data-glossary-chapter="ch1">
      <SLabel>Core Definitions</SLabel>
      <Card title="Operations Management">
        The set of activities that create value by transforming inputs into outputs. One of the{" "}
        <Term>3 Essential Business Functions</Term>: Marketing, Finance/Accounting, and{" "}
        <GlossaryTerm id="operations_management" sectionId={S.ch1}>
          Operations
        </GlossaryTerm>
        .
      </Card>
      <Card title="Supply Chain">
        A global network of organizations and activities that supply a firm with goods and services — from raw material to end consumer.
      </Card>
      <Card title="Productivity">
        <GlossaryTerm id="productivity" sectionId={S.ch1}>
          Productivity
        </GlossaryTerm>{" "}
        is the ratio of outputs to inputs. Hard to measure in the <Term>service sector</Term> because output quality varies and it is
        labor-intensive.
        <FormulaBox>{`Single-Factor:  Units Produced ÷ Labor Hours Used
Multi-Factor:   Output ÷ (Labor + Materials + Energy + Capital + Misc)
% Increase:     (New − Original) ÷ Original`}</FormulaBox>
      </Card>

      <SLabel>10 Strategic OM Decisions</SLabel>
      <Card>
        <NumList
          items={[
            "Goods & service design",
            "Managing quality",
            "Process & capacity design",
            "Location strategy",
            "Layout strategy",
            "Human resources & job design",
            "Supply chain management",
            "Inventory management",
            "Scheduling",
            "Maintenance",
          ]}
        />
      </Card>

      <SLabel>Chapter 2 — Strategy</SLabel>
      <Grid2>
        <Card title="Mission vs. Strategy">
          <GlossaryTerm id="mission_vs_strategy" sectionId={S.ch1}>
            Mission:
          </GlossaryTerm>{" "}
          Purpose — why the organization exists.
          <br />
          <br />
          <GlossaryTerm id="mission_vs_strategy" sectionId={S.ch1}>
            Strategy:
          </GlossaryTerm>{" "}
          The action plan to achieve the mission; how competitive advantage is gained.
        </Card>
        <Card title="Outsourcing">
          <GlossaryTerm id="outsourcing" sectionId={S.ch1}>
            Outsourcing
          </GlossaryTerm>{" "}
          is transferring activities traditionally done internally to external suppliers. Trade-off: cost savings vs. loss of control.
        </Card>
      </Grid2>

      <SLabel>3 Competitive Advantage Strategies</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <GlossaryTerm id="competitive_advantage_three" sectionId={S.ch1}>
                Differentiation
              </GlossaryTerm>{" "}
              — Better or unique product/service. Compete on quality, features, or customization. (Apple, Ritz-Carlton)
            </>,
            <>
              <GlossaryTerm id="competitive_advantage_three" sectionId={S.ch1}>
                Cost Leadership
              </GlossaryTerm>{" "}
              — Compete on price by achieving lower costs than competitors. (Walmart, McDonald's)
            </>,
            <>
              <GlossaryTerm id="competitive_advantage_three" sectionId={S.ch1}>
                Response
              </GlossaryTerm>{" "}
              — Compete on speed, flexibility, and reliability of delivery. (Zara, Amazon Prime)
            </>,
          ]}
        />
      </Card>

      <SLabel>Product Life Cycle (4 Stages)</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <GlossaryTerm id="product_life_cycle" sectionId={S.ch1}>
                Introduction
              </GlossaryTerm>{" "}
              — Low sales, high cost, losses common. Product development focus.
            </>,
            <>
              <GlossaryTerm id="product_life_cycle" sectionId={S.ch1}>
                Growth
              </GlossaryTerm>{" "}
              — Rapid sales increase, competitors enter, profits begin.
            </>,
            <>
              <GlossaryTerm id="product_life_cycle" sectionId={S.ch1}>
                Maturity
              </GlossaryTerm>{" "}
              — Peak sales, intense competition, cost control critical.
            </>,
            <>
              <GlossaryTerm id="product_life_cycle" sectionId={S.ch1}>
                Decline
              </GlossaryTerm>{" "}
              — Sales fall; product may be discontinued or replaced.
            </>,
          ]}
        />
      </Card>
    </div>
  );
}
