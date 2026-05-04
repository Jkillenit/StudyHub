import { BulletList, Card, FormulaBox, Grid2, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch6() {
  return (
    <div data-glossary-chapter="ch6">
      <Card title="Quality">
        The totality of features and characteristics of a product or service bearing on its ability to satisfy stated or implied needs.
        <br />
        <br />
        <Term>3 Views:</Term> User-based (eye of the beholder) | Manufacturing-based (conformance to specs) | Product-based (measurable attributes)
      </Card>

      <SLabel>4 Costs of Quality</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <GlossaryTerm id="quality_costs" sectionId={S.ch6}>
                Prevention
              </GlossaryTerm>{" "}
              — Reducing potential defects (training, quality planning)
            </>,
            <>
              <GlossaryTerm id="quality_costs" sectionId={S.ch6}>
                Appraisal
              </GlossaryTerm>{" "}
              — Evaluating products for defects (inspection, testing)
            </>,
            <>
              <GlossaryTerm id="quality_costs" sectionId={S.ch6}>
                Internal Failure
              </GlossaryTerm>{" "}
              — Defects found before delivery (scrap, rework)
            </>,
            <>
              <GlossaryTerm id="quality_costs" sectionId={S.ch6}>
                External Failure
              </GlossaryTerm>{" "}
              — Defects found after delivery (warranty, returns, lost customers)
            </>,
          ]}
        />
      </Card>

      <SLabel>Key TQM Concepts</SLabel>
      <Grid2>
        <Card title="TQM — Total Quality Management">
          <GlossaryTerm id="tqm" sectionId={S.ch6}>
            Total Quality Management (TQM)
          </GlossaryTerm>{" "}
          is an organization-wide commitment to continuously improving quality. Based on customer focus, employee involvement, and continuous
          improvement.
        </Card>
        <Card title="Continuous Improvement (Kaizen)">
          Never-ending small, incremental improvements everywhere. Uses PDCA cycle: <Term>Plan → Do → Check → Act</Term>.
        </Card>
        <Card title="Six Sigma">
          <GlossaryTerm id="six_sigma" sectionId={S.ch6}>
            Six Sigma
          </GlossaryTerm>{" "}
          is a data-driven approach to eliminate defects. Goal: no more than <Term>3.4 defects per million opportunities</Term>. Uses DMAIC:
          Define, Measure, Analyze, Improve, Control.
        </Card>
        <Card title="Employee Empowerment">
          Extending responsibility and authority for decisions to employees. Allows workers to solve quality problems at the source. Often involves
          quality circles.
        </Card>
        <Card title="Benchmarking">
          Comparing your operations against the best-in-class practices of competitors or non-competitors to identify performance gaps.
        </Card>
        <Card title="Just-in-Time (JIT)">
          Forces problem-solving via reduced inventory. No buffer to hide defects — problems must be resolved immediately.
        </Card>
      </Grid2>
      <Card title="Statistical Process Control (SPC)">
        <GlossaryTerm id="spc" sectionId={S.ch6s}>
          Statistical process control (SPC)
        </GlossaryTerm>{" "}
        uses statistical methods to monitor and control a process to ensure it operates at full potential. Uses control charts to detect when a
        process goes out of control.
      </Card>
    </div>
  );
}
