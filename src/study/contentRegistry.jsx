import { lazy, Suspense, memo } from "react";
import { ChapterContentSkeleton } from "./ChapterContentSkeleton.jsx";

const Ch1 = lazy(() => import("./sections/Ch1.jsx"));
const Ch3 = lazy(() => import("./sections/Ch3.jsx"));
const Ch4 = lazy(() => import("./sections/Ch4.jsx"));
const Ch6 = lazy(() => import("./sections/Ch6.jsx"));
const Ch6s = lazy(() => import("./sections/Ch6s.jsx"));
const Ch7 = lazy(() => import("./sections/Ch7.jsx"));
const Ch11 = lazy(() => import("./sections/Ch11.jsx"));
const Ch12 = lazy(() => import("./sections/Ch12.jsx"));
const Ch16 = lazy(() => import("./sections/Ch16.jsx"));
const FinalReview = lazy(() => import("./final/FinalReview.jsx"));
const Formulas = lazy(() => import("./sections/Formulas.jsx"));
const Flashcards = lazy(() => import("./flashcards/FlashcardDeck.jsx"));

const byId = {
  ch1: Ch1,
  ch3: Ch3,
  ch4: Ch4,
  ch6: Ch6,
  ch6s: Ch6s,
  ch7: Ch7,
  ch11: Ch11,
  ch12: Ch12,
  ch16: Ch16,
  final: FinalReview,
  formulas: Formulas,
  flashcards: Flashcards,
};

export function hasOm300SectionContent(sectionId) {
  return !!byId[sectionId];
}

export const StudySectionBody = memo(function StudySectionBody({ sectionId }) {
  const Comp = byId[sectionId];
  if (!Comp) return null;
  return (
    <Suspense fallback={<ChapterContentSkeleton />}>
      <Comp />
    </Suspense>
  );
});
