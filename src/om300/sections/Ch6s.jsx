import { Card, FormulaBox, Grid2, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch6s() {
  return (
    <div data-glossary-chapter="ch6s">
      <SLabel>Variation Types</SLabel>
      <Grid2>
        <Card title="Natural (Common Cause) Variation" accent="#1e3a2e">
          <GlossaryTerm id="common_vs_assignable" sectionId={S.ch6s}>
            Common-cause (natural)
          </GlossaryTerm>{" "}
          variation is inherent in every process. Caused by many small, random factors. When only natural variation is present, the process is{" "}
          <Term>in control</Term>. Cannot be eliminated without redesigning the process.
        </Card>
        <Card title="Assignable (Special Cause) Variation" accent="#3a1e1e">
          <GlossaryTerm id="common_vs_assignable" sectionId={S.ch6s}>
            Assignable (special-cause)
          </GlossaryTerm>{" "}
          variation is caused by a specific, identifiable factor (bad material, operator error). Indicates process is <Term>out of control</Term>.
          Must be found and eliminated.
        </Card>
      </Grid2>

      <SLabel>Control Charts</SLabel>
      <Card title="X-Bar Chart — Known σ">
        Monitors the mean of samples when population standard deviation is known.{" "}
        <GlossaryTerm id="control_limits" sectionId={S.ch6s}>
          Control limits (UCL / LCL)
        </GlossaryTerm>{" "}
        use the process standard deviation:
        <FormulaBox>{`UCL / LCL = x̄̄ ± z·σx̄
σx̄ = σ ÷ √n`}</FormulaBox>
        x̄̄ = grand mean | z = # std deviations (usually 3) | σ = population std dev | n = sample size
      </Card>
      <Card title="X-Bar Chart — Unknown σ (uses R̄)">
        When σ is unknown, use the average range and factor A₂ from the table.
        <FormulaBox>{`UCL / LCL = x̄̄ ± A₂R̄
R̄ = ΣRᵢ ÷ k`}</FormulaBox>
        A₂ from table (based on n) | k = number of samples | Rᵢ = range for sample i
      </Card>
      <Card title="R Chart (Range Chart)">
        Monitors variability within samples. Used alongside the X-bar chart.
        <FormulaBox>{`UCLᴿ = D₄R̄
LCLᴿ = D₃R̄`}</FormulaBox>
        D₃ and D₄ from the control chart factor table (based on sample size n).
      </Card>
      <Card title="p Chart (Proportion Defective)">
        Monitors the fraction of defective items. Used for attributes (pass/fail).
        <FormulaBox>{`UCL / LCLₚ = p̄ ± z·σ̂ₚ
σ̂ₚ = √[p̄(1 − p̄) ÷ n]`}</FormulaBox>
        p̄ = mean fraction defective | n = sample size | z = 3 for 99.73%
      </Card>
      <Card title="c Chart (Count of Defects)">
        Monitors the number of defects per unit. Used when each unit can have multiple defects.
        <FormulaBox>{`UCL / LCLc = c̄ ± z√c̄`}</FormulaBox>
        c̄ = average number of defects per unit | z = 3 for 3-sigma limits
      </Card>

      <SLabel>Common z Values</SLabel>
      <Card>
        <FormulaBox>{`90.0%  confidence → z = 1.65
95.0%  confidence → z = 1.96
95.45% confidence → z = 2.00
99.0%  confidence → z = 2.58
99.73% confidence → z = 3.00  ← standard for SPC`}</FormulaBox>
      </Card>

      <Card title="Process Capability">
        The ability of a process to meet design specifications. A capable process fits its natural variation within the design tolerance (spec
        limits). Typically measured by Cpk or Cp — values ≥ 1.0 indicate capability.
      </Card>
    </div>
  );
}
