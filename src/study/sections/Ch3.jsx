import { Card, FormulaBox, Grid2, NumList, SLabel, Term } from "../../components/study/StudyTypography.jsx";
import { FINAL_SECTION_IDS as S, GlossaryTerm } from "../../glossary/index.js";

export default function Ch3() {
  return (
    <div data-glossary-chapter="ch3">
      <SLabel>3 Phases of Project Management</SLabel>
      <Card>
        <NumList
          items={[
            <>
              <GlossaryTerm id="project_phases" sectionId={S.ch3}>
                Planning
              </GlossaryTerm>{" "}
              — Goal setting, defining the project, team organization
            </>,
            <>
              <GlossaryTerm id="project_phases" sectionId={S.ch3}>
                Scheduling
              </GlossaryTerm>{" "}
              — Relating people/money/supplies to activities; CPM/PERT
            </>,
            <>
              <GlossaryTerm id="project_phases" sectionId={S.ch3}>
                Controlling
              </GlossaryTerm>{" "}
              — Monitoring resources, costs, quality; revising plans
            </>,
          ]}
        />
      </Card>

      <SLabel>Critical Path Method — 6 Steps</SLabel>
      <Card>
        <NumList
          items={[
            "Define the project and all activities",
            "Develop relationships between activities (precedence)",
            "Draw the network diagram",
            "Assign time/cost estimates to each activity",
            <>
              <Term>Compute the longest time path</Term> — this is the{" "}
              <GlossaryTerm id="critical_path" sectionId={S.ch3}>
                critical path
              </GlossaryTerm>
            </>,
            "Use the network to plan, schedule, monitor, and control",
          ]}
        />
      </Card>

      <SLabel>Key Terms</SLabel>
      <Grid2>
        <Card title="ES / EF / LS / LF">
          <Term>ES</Term> = Earliest Start — earliest an activity can begin
          <br />
          <Term>EF</Term> = Earliest Finish = ES + duration
          <br />
          <Term>LS</Term> = Latest Start — latest without delaying project
          <br />
          <Term>LF</Term> = Latest Finish — latest end without delay
        </Card>
        <Card title="Slack Time">
          <GlossaryTerm id="slack_time" sectionId={S.ch3}>
            Slack time
          </GlossaryTerm>{" "}
          is how long an activity can be delayed without delaying the whole project. Activities on the critical path have{" "}
          <GlossaryTerm id="slack_time" sectionId={S.ch3}>
            zero slack
          </GlossaryTerm>
          .
          <FormulaBox>{`Slack = LS − ES
Slack = LF − EF`}</FormulaBox>
        </Card>
      </Grid2>

      <Card title="Project Crashing">
        <GlossaryTerm id="project_crashing" sectionId={S.ch3}>
          Project crashing
        </GlossaryTerm>{" "}
        means shortening project duration by adding resources to critical path activities. Trade-off:{" "}
        <Term>time saved vs. cost increase</Term>. Always crash the cheapest critical activity first.
      </Card>
      <Card title="Role of the Project Manager">
        Manages across functional boundaries, balances time/cost/quality constraints, handles stakeholder communication. Ethical issues include:
        falsifying reports, misallocating resources, and conflicts of interest.
      </Card>
    </div>
  );
}
