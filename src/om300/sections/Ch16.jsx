import { Card, Grid2, NumList, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch16() {
  return (
    <div data-glossary-chapter="ch16">
      <Grid2>
        <Card title="Lean Operations">
          <GlossaryTerm id="lean_ops" sectionId={S.ch16}>
            Lean operations
          </GlossaryTerm>{" "}
          maximize customer value while minimizing waste. Everything that does not add value is a target for elimination.
        </Card>
        <Card title="Just-in-Time (JIT)">
          Pull system — produce/deliver only as needed, in the right quantity at the right time. Drives continuous improvement by exposing problems.
        </Card>
      </Grid2>

      <Card title="Toyota Production System (TPS)">
        The foundation of lean manufacturing. Built on two pillars: <Term>Jidoka</Term> (automation with a human touch — stop when defect found) and{" "}
        <Term>Just-in-Time</Term> (produce only what is needed, when needed, in the amount needed).
      </Card>

      <SLabel>Ohno's Seven Wastes (Muda)</SLabel>
      <Card>
        <NumList
          items={[
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Overproduction
              </GlossaryTerm>{" "}
              — Producing more than demanded
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Queues/Waiting
              </GlossaryTerm>{" "}
              — Idle time between processes
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Transportation
              </GlossaryTerm>{" "}
              — Moving material unnecessarily
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Inventory
              </GlossaryTerm>{" "}
              — All inventory beyond what is necessary
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Motion
              </GlossaryTerm>{" "}
              — People moving without adding value
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Overprocessing
              </GlossaryTerm>{" "}
              — Work beyond customer requirements
            </>,
            <>
              <GlossaryTerm id="seven_wastes" sectionId={S.ch16}>
                Defects
              </GlossaryTerm>{" "}
              — Rework, scrap, warranty claims
            </>,
          ]}
        />
      </Card>

      <SLabel>The 5 S's</SLabel>
      <Card>
        <NumList
          items={[
            <>
              <GlossaryTerm id="five_s" sectionId={S.ch16}>
                Sort (Seiri)
              </GlossaryTerm>{" "}
              — Remove what is not needed
            </>,
            <>
              <GlossaryTerm id="five_s" sectionId={S.ch16}>
                Straighten (Seiton)
              </GlossaryTerm>{" "}
              — Organize and label everything
            </>,
            <>
              <GlossaryTerm id="five_s" sectionId={S.ch16}>
                Shine (Seiso)
              </GlossaryTerm>{" "}
              — Clean the workplace
            </>,
            <>
              <GlossaryTerm id="five_s" sectionId={S.ch16}>
                Standardize (Seiketsu)
              </GlossaryTerm>{" "}
              — Establish standards for the above
            </>,
            <>
              <GlossaryTerm id="five_s" sectionId={S.ch16}>
                Sustain (Shitsuke)
              </GlossaryTerm>{" "}
              — Maintain discipline and the system
            </>,
          ]}
        />
      </Card>

      <SLabel>Other Key Lean Concepts</SLabel>
      <Grid2>
        <Card title="Kanban">
          <GlossaryTerm id="kanban" sectionId={S.ch16}>
            Kanban
          </GlossaryTerm>{" "}
          is a signaling system (card/container) that controls work flow through a pull system. Downstream signals upstream when more parts are needed.
          Controls WIP and prevents overproduction.
        </Card>
        <Card title="Supplier Partnerships">
          Lean requires tight, long-term supplier relationships. Suppliers must deliver small quantities frequently and on time. The supplier is
          treated as an extension of the factory.
        </Card>
        <Card title="Lean & Quality">
          Lean and quality reinforce each other. Low inventory exposes defects immediately. JIT forces quality at the source — workers are empowered
          to stop production when defects are found (Jidoka).
        </Card>
        <Card title="Reduced Setup Time">
          Small batch sizes require fast setups. Reducing setup time allows economical small-batch production, cutting inventory and increasing
          flexibility. (SMED — Single Minute Exchange of Die)
        </Card>
      </Grid2>
    </div>
  );
}
