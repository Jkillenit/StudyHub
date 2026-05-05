import { Mark, mergeAttributes } from "@tiptap/core";

/** Inline glossary highlight mark — serialized as span[data-glossary][data-definition]. */
export const GlossaryMark = Mark.create({
  name: "glossaryTerm",

  addAttributes() {
    return {
      term: { default: null },
      definition: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-glossary]",
        getAttrs: (el) => ({
          term: el.getAttribute("data-glossary"),
          definition: el.getAttribute("data-definition") ?? "",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { term, definition, ...rest } = HTMLAttributes;
    return [
      "span",
      mergeAttributes(rest, {
        "data-glossary": term,
        "data-definition": definition ?? "",
        class: "sh-glossary-mark",
      }),
      0,
    ];
  },
});
