import { BulletList, Card, FormulaBox, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch4() {
  return (
    <div data-glossary-chapter="ch4">
      <Card title="Forecasting">
        The art and science of predicting future events. Used for planning production, inventory, workforce, and capacity. All forecasts contain
        error — the goal is to minimize it.
      </Card>

      <SLabel>Time Horizons</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <GlossaryTerm id="forecasting_horizons" sectionId={S.ch4}>
                Short-range
              </GlossaryTerm>{" "}
              — Up to 1 year (usually &lt;3 months). Job scheduling, purchasing, staffing.
            </>,
            <>
              <GlossaryTerm id="forecasting_horizons" sectionId={S.ch4}>
                Medium-range
              </GlossaryTerm>{" "}
              — 3 months to 3 years. Sales planning, production budgeting.
            </>,
            <>
              <GlossaryTerm id="forecasting_horizons" sectionId={S.ch4}>
                Long-range
              </GlossaryTerm>{" "}
              — 3+ years. New products, facilities, R&amp;D.
            </>,
          ]}
        />
      </Card>

      <SLabel>Qualitative Methods</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Jury of executive opinion</Term> — Pool opinions of high-level experts; quick but can be dominated by one person.
            </>,
            <>
              <Term>Delphi method</Term> — Iterative anonymous expert survey until consensus; eliminates group pressure.
            </>,
            <>
              <Term>Sales force composite</Term> — Salespeople estimate their territories; combined into an overall forecast.
            </>,
            <>
              <Term>Consumer market survey</Term> — Ask customers about purchase intentions; useful but slow and costly.
            </>,
          ]}
        />
      </Card>

      <SLabel>Quantitative Methods</SLabel>
      <Card title="Naïve Approach">
        Next period's forecast = last period's actual demand. Simplest possible method — no calculation required. Good baseline for comparison.
      </Card>
      <Card title="Moving Average">
        <FormulaBox>{`MA  = Σ(demand in previous n periods) ÷ n
WMA = Σ(Weight × Demand) ÷ Σ Weights`}</FormulaBox>
        <GlossaryTerm id="moving_average" sectionId={S.ch4}>
          Moving average
        </GlossaryTerm>{" "}
        and weighted MA assign more weight to recent periods. Weights must sum to 1 (or be divided by their sum).
      </Card>
      <Card title="Exponential Smoothing">
        <FormulaBox>{`Ft = Ft−1 + α(At−1 − Ft−1)`}</FormulaBox>
        Ft = new forecast | Ft−1 = prior forecast | α = smoothing constant (0–1) | At−1 = prior actual.
        <br />
        <GlossaryTerm id="exponential_smoothing" sectionId={S.ch4}>
          Exponential smoothing
        </GlossaryTerm>{" "}
        — higher α → more responsive. Lower α → smoother.
      </Card>
      <Card title="Trend Projection">
        <FormulaBox>{`ŷ = a + bt
b = [Σ(xy) − n(x̄)(ȳ)] ÷ [Σ(x²) − n(x̄)²]
a = ȳ − bx̄`}</FormulaBox>
        b = slope | a = y-intercept | t = time period
      </Card>
      <Card title="Trend + Seasonality">
        <FormulaBox>{`Ft = (a + bt)(St)`}</FormulaBox>
        St = seasonal index. Calculate: Average demand for that season ÷ Overall average demand.
      </Card>

      <SLabel>Forecast Error Measures</SLabel>
      <Card>
        <FormulaBox>{`MAD  = Σ|Actual − Forecast| ÷ n
MSE  = Σ(Forecast errors)² ÷ n
MAPE = Σ[100 × |Actual − Forecast| ÷ Actual] ÷ n`}</FormulaBox>
        <GlossaryTerm id="mad" sectionId={S.ch4}>
          MAD (mean absolute deviation)
        </GlossaryTerm>{" "}
        uses the same units as data. MSE = penalizes large errors more. MAPE = percentage, comparable across scales.
      </Card>

      <SLabel>4 Time Series Components</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Trend (T)</Term> — Long-term upward or downward movement
            </>,
            <>
              <Term>Seasonality (S)</Term> — Regular repeating pattern within a year
            </>,
            <>
              <Term>Cycles (C)</Term> — Wavelike ups and downs over multiple years
            </>,
            <>
              <Term>Random (R)</Term> — Unexplained, irregular variation (noise)
            </>,
          ]}
        />
      </Card>
    </div>
  );
}
