import { BulletList, FormulaBox, SLabel } from "../../components/study/StudyTypography.jsx";

export default function Formulas() {
  return (
    <div>
      <p className="mono mb-3" style={{ fontSize: 11, color: "var(--sh-text-dim)" }}>
        EXAM QUICK-REFERENCE — ALL QUANTITATIVE FORMULAS.
      </p>

      <SLabel>Ch 1 — Productivity</SLabel>
      <FormulaBox>{`Single-Factor:  Units Produced ÷ Labor Hours Used
Multi-Factor:   Output ÷ (Labor + Materials + Energy + Capital + Misc)
% Increase:     (New − Original) ÷ Original`}</FormulaBox>

      <SLabel>Ch 3 — Project Management</SLabel>
      <FormulaBox>{`Slack = LS − ES    or    Slack = LF − EF
EF = ES + Activity Duration
LS = LF − Activity Duration
Critical Path = Longest path (Slack = 0 on all activities)`}</FormulaBox>

      <SLabel>Ch 4 — Forecasting</SLabel>
      <FormulaBox>{`Moving Avg:       Σ(demand, n periods) ÷ n
Weighted MA:      Σ(Weight × Demand) ÷ Σ Weights
Exp. Smoothing:   Ft = Ft−1 + α(At−1 − Ft−1)

Trend Projection:
  b = [Σ(xy) − n(x̄)(ȳ)] ÷ [Σ(x²) − n(x̄)²]
  a = ȳ − bx̄
  ŷ = a + bt

Trend + Seasonality: Ft = (a + bt)(St)

MAD  = Σ|Actual − Forecast| ÷ n
MSE  = Σ(errors²) ÷ n
MAPE = Σ[100 × |Actual − Forecast| ÷ Actual] ÷ n`}</FormulaBox>

      <SLabel>Ch 6s — Statistical Process Control</SLabel>
      <FormulaBox>{`X-bar (known σ):   UCL/LCL = x̄̄ ± z·(σ ÷ √n)
X-bar (unknown σ): UCL/LCL = x̄̄ ± A₂R̄     R̄ = ΣRᵢ ÷ k
R Chart:           UCL = D₄R̄    LCL = D₃R̄
p Chart:           UCL/LCL = p̄ ± z·√[p̄(1−p̄) ÷ n]
c Chart:           UCL/LCL = c̄ ± z√c̄

z = 3.00 for 99.73% (standard SPC)
z = 2.00 for 95.45%`}</FormulaBox>

      <SLabel>Ch 11 — Supply Chain Metrics</SLabel>
      <FormulaBox>{`Inventory Turnover  = COGS ÷ Ave. Inventory
Weeks of Supply     = Ave. Inventory ÷ (Annual COGS ÷ 52)
% Invested in Inv.  = (Ave. Inventory Investment ÷ Total Assets) × 100`}</FormulaBox>

      <SLabel>Ch 12 — Inventory</SLabel>
      <FormulaBox>{`H = I × P     (holding cost = % of price × unit price)

EOQ:  Q* = √(2DS ÷ H)
EPQ:  Qp* = √[2DS ÷ (H × [1 − d÷p])]

Annual Setup Cost    = (D ÷ Q) × S
Annual Holding (EOQ) = (Q ÷ 2) × H
Annual Holding (EPQ) = H(Q÷2)[1 − (d÷p)]
Total Cost           = Setup + Holding
Total Cost w/ mat    = Setup + Holding + (P × D)

ROP = d × L          d = D ÷ working days/year
ROP w/ safety stock  = dL + ss

Max Inventory (EPQ)  = pt − dt
Ave. Inventory (EPQ) = Max Inventory ÷ 2

# Orders             = D ÷ Q*
Time Between Orders  = Q* ÷ D`}</FormulaBox>
    </div>
  );
}
