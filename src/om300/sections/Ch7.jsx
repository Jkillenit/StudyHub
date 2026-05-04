import { BulletList, Card, Grid2, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch7() {
  return (
    <div data-glossary-chapter="ch7">
      <SLabel>4 Process Strategies</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <GlossaryTerm id="process_focus" sectionId={S.ch7}>
                Process Focus
              </GlossaryTerm>{" "}
              — Low volume, high variety. Equipment grouped by function. (Hospitals, machine shops.) High flexibility, high unit cost.
            </>,
            <>
              <GlossaryTerm id="process_focus" sectionId={S.ch7}>
                Repetitive Focus
              </GlossaryTerm>{" "}
              — Modules assembled into many output combinations. Assembly lines with interchangeable parts. (McDonald's, auto assembly.)
            </>,
            <>
              <GlossaryTerm id="process_focus" sectionId={S.ch7}>
                Product Focus
              </GlossaryTerm>{" "}
              — High volume, low variety. Continuous standardized production. (Bottling plants, paper mills.) Low flexibility, low unit cost.
            </>,
            <>
              <GlossaryTerm id="mass_customization" sectionId={S.ch7}>
                Mass Customization
              </GlossaryTerm>{" "}
              — High volume AND high variety. Built to order using standard modules. (Dell, custom shoes.) Most complex.
            </>,
          ]}
        />
      </Card>

      <SLabel>Capacity Definitions</SLabel>
      <Grid2>
        <Card title="Design Capacity">
          The theoretical maximum output under ideal conditions. The "ceiling" — rarely achieved in practice.
        </Card>
        <Card title="Effective Capacity">
          The capacity a firm expects given current constraints (maintenance, scheduling, quality). Always ≤ design capacity.
        </Card>
        <Card title="Actual Output">
          The rate of output actually achieved. Cannot exceed effective capacity. Affected by breakdowns, defects, absenteeism.
        </Card>
        <Card title="Bottleneck" accent="#2d1e3a">
          The operation with the <Term>lowest capacity</Term> — limits throughput of the entire system. The bottleneck determines maximum output rate.
        </Card>
      </Grid2>
    </div>
  );
}
