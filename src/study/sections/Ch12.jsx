import { BulletList, Card, FormulaBox, Grid2, NumList, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch12() {
  return (
    <div data-glossary-chapter="ch12">
      <SLabel>4 Types of Inventory</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Raw Material</Term> — Purchased inputs not yet processed
            </>,
            <>
              <Term>Work-in-Process (WIP)</Term> — Items started but not yet finished
            </>,
            <>
              <Term>MRO</Term> — Maintenance, Repair, Operating supplies that support production
            </>,
            <>
              <Term>Finished Goods</Term> — Completed products awaiting sale or shipment
            </>,
          ]}
        />
      </Card>

      <Grid2>
        <Card title="ABC Analysis">
          <GlossaryTerm id="abc_analysis" sectionId={S.ch12}>
            ABC analysis
          </GlossaryTerm>{" "}
          categorizes inventory by annual dollar volume:
          <br />
          <Term>A items</Term> — ~15% of items, ~70-80% of value (tight control)
          <br />
          <Term>B items</Term> — ~30% of items, ~15-25% of value
          <br />
          <Term>C items</Term> — ~55% of items, ~5% of value (loose control)
        </Card>
        <Card title="Cycle Counting">
          Periodic count of a subset of inventory items. More frequent for A items. Allows errors to be corrected without full physical inventory
          shutdowns.
        </Card>
      </Grid2>

      <SLabel>Inventory Costs</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Holding Cost (H)</Term> — Cost of carrying one unit for one year (storage, insurance, spoilage, opportunity cost). Typically
              20-40% of item value.
            </>,
            <>
              <Term>Ordering/Setup Cost (S)</Term> — Fixed cost per order or production run, regardless of order size.
            </>,
            <>
              <Term>H = I × P</Term> — Where I = holding cost as % of price, P = unit price
            </>,
          ]}
        />
      </Card>

      <SLabel>EOQ Model — Answers 2 Questions: How Much? & When?</SLabel>
      <Card title="Economic Order Quantity (EOQ)">
        <GlossaryTerm id="eoq" sectionId={S.ch12}>
          Economic order quantity (EOQ)
        </GlossaryTerm>{" "}
        balances ordering and holding costs:
        <FormulaBox>{`Q* = √(2DS ÷ H)

Annual Setup Cost    = (D ÷ Q) × S
Annual Holding Cost  = (Q ÷ 2) × H
Total Annual Cost    = Setup Cost + Holding Cost
Total Cost w/ mat    = Setup + Holding + (P × D)

ROP = d × L             d = D ÷ working days/year
ROP w/ safety stock = dL + ss

Number of Orders    = D ÷ Q*
Time Between Orders = Q* ÷ D  (or working days ÷ # orders)`}</FormulaBox>
        D = annual demand | S = setup/order cost | H = holding cost | d = daily demand | L = lead time | ss ={" "}
        <GlossaryTerm id="safety_stock" sectionId={S.ch12}>
          safety stock
        </GlossaryTerm>
      </Card>

      <SLabel>EPQ Model (Production Order Quantity)</SLabel>
      <Card title="Economic Production Quantity (EPQ)">
        Used when the firm both produces and uses the item simultaneously.
        <FormulaBox>{`Qp* = √[2DS ÷ (H × [1 − (d÷p)])]

Annual Holding Cost (EPQ) = H × (Q÷2) × [1 − (d÷p)]

Max Inventory  = pt − dt
Ave. Inventory = Max Inventory ÷ 2`}</FormulaBox>
        p = daily production rate | d = daily demand rate
      </Card>

      <Card title="Quantity Discount Model">
        Reduced price when ordering large quantities. Calculate <Term>Total Cost = Setup + Holding + Product Cost (P × D)</Term> for each price
        break. Select the quantity with lowest total cost. May need to adjust Q up to the minimum for each discount tier.
      </Card>
    </div>
  );
}
