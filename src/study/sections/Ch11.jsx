import { BulletList, Card, FormulaBox, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch11() {
  return (
    <div data-glossary-chapter="ch11">
      <Card title="Supply Chain Management">
        <GlossaryTerm id="supply_chain_mgmt" sectionId={S.ch11}>
          Supply chain management
        </GlossaryTerm>{" "}
        is the integration of all activities — sourcing, procurement, conversion, and logistics — plus coordination with channel partners
        (suppliers, intermediaries, third-party providers, customers). Goal: competitive advantage through lower cost and better service.
      </Card>

      <SLabel>6 Sourcing Strategies</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Many Suppliers</Term> — Commodities. Suppliers compete on price. Low relationship depth.
            </>,
            <>
              <Term>Few Suppliers</Term> — Long-term partnerships. Higher quality, lower transaction costs. Vulnerable to supplier problems.
            </>,
            <>
              <Term>Vertical Integration</Term> — Own upstream suppliers or downstream distributors. Maximum control, high capital. (Forward = own
              distribution; Backward = own suppliers)
            </>,
            <>
              <Term>Joint Venture</Term> — Formal collaboration. Shared risk and expertise. Used when full ownership is not desired.
            </>,
            <>
              <Term>Keiretsu Network</Term> — Japanese model. Supplier becomes part of company coalition, often with equity stake.
            </>,
            <>
              <Term>Virtual Companies</Term> — Rely on suppliers for nearly all functions. Maximum flexibility, minimal fixed assets.
            </>,
          ]}
        />
      </Card>

      <SLabel>Shipping Modes</SLabel>
      <Card>
        <BulletList
          items={[
            <>
              <Term>Trucking</Term> — Most flexible, door-to-door. High cost per ton-mile.
            </>,
            <>
              <Term>Rail</Term> — Bulk goods, long distance, low cost. Inflexible routing.
            </>,
            <>
              <Term>Waterway</Term> — Cheapest per ton-mile. Slowest. Bulky/heavy goods.
            </>,
            <>
              <Term>Airfreight</Term> — Fastest. Most expensive. High-value or perishable goods.
            </>,
            <>
              <Term>Pipelines</Term> — Oil, gas, water only. Low operating cost after installation.
            </>,
            <>
              <Term>Multimodal/Intermodal</Term> — Combinations (e.g., truck + rail). Balances cost and flexibility.
            </>,
          ]}
        />
      </Card>

      <Card title="Bullwhip Effect">
        The <GlossaryTerm id="bullwhip_effect" sectionId={S.ch11}>bullwhip effect</GlossaryTerm>: small fluctuations in end-user demand get
        amplified as they move upstream through the supply chain. Each tier over-orders due to uncertainty, causing large swings in inventory and
        production. Caused by demand signal processing, order batching, price fluctuations, and shortage gaming.
      </Card>

      <SLabel>Supply Chain Performance Metrics</SLabel>
      <Card>
        <FormulaBox>{`Inventory Turnover    = COGS ÷ Ave. Inventory
Weeks of Supply       = Ave. Inventory ÷ (Annual COGS ÷ 52)
% Invested in Inv.    = (Ave. Inventory Investment ÷ Total Assets) × 100`}</FormulaBox>
        Higher turnover = inventory moving fast. Lower weeks of supply = more efficient.
      </Card>
    </div>
  );
}
