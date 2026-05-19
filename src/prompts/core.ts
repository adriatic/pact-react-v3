// Copyright © 2026 PACTResearch.net. All rights reserved.\n// pactresearch.net
export type CorePrompt = {
  id: string;
  title: string;
  teaser: string;
  text: string;
};

export const corePrompts: CorePrompt[] = [
  {
    id: "00",
    title: "Getting Started",
    teaser: "PACT is not a chat interface. It's something fundamentally different — and once you see why, you won't want to go back.",
    text: `Introduce PACT — a new kind of AI interface that treats interaction with language models as structured notebook execution rather than conversation. Explain why this matters and what it enables that a standard chat interface cannot.`,
  },
  {
    id: "01",
    title: "What am I looking at?",
    teaser: "You're inside VSCode, but you're not writing code. What you're looking at is a new kind of thinking environment — and it changes everything about how you work with AI.",
    text: `I have PACT open inside VSCode. I can see a panel with a text input and a Run button. 
What is this environment, and how is it fundamentally different from a browser chat interface like ChatGPT or Claude?`,
  },
  {
    id: "02",
    title: "What just happened?",
    teaser: "You typed something and pressed Run. A labeled box appeared. That sequence — simple as it looks — is hiding a surprisingly deep execution pipeline.",
    text: `I typed a prompt into PACT and pressed Run. A labeled box appeared below containing your response. 
What happened between me pressing Run and the response appearing? Walk me through the execution pipeline.`,
  },
  {
    id: "03",
    title: "Why a cell, not a bubble?",
    teaser: "Chat interfaces give you bubbles. PACT gives you cells. That's not a cosmetic difference — it's a philosophical one with real consequences for how knowledge gets built.",
    text: `In a normal chat interface, my message and your response appear as a flowing conversation. 
In PACT, my prompt disappears from the input and your response appears in a discrete labeled cell. 
What is the significance of that difference?`,
  },
  {
    id: "04",
    title: "What does Retry actually mean?",
    teaser: "In a chat interface, there's no Retry. PACT has one — and what it reveals about the nature of LLM responses will change how you think about every answer you've ever gotten from an AI.",
    text: `I pressed the Retry button on a completed cell. A new cell appeared with a similar but 
different response. In a chat interface there is no equivalent to this. What does Retry reveal 
about the nature of LLM responses, and why does PACT treat it as a first-class operation?`,
  },
  {
    id: "05",
    title: "What is the cell hierarchy for?",
    teaser: "Some cells are indented under others. That's not just organization — it's a reasoning capability that flat chat transcripts simply cannot replicate.",
    text: `PACT displays cells in a hierarchy — some cells are indented under others. 
What does that parent-child relationship represent, and what reasoning capability does it enable 
that a flat chat transcript cannot?`,
  },
  {
    id: "06",
    title: "What is a PACT cell as a data structure?",
    teaser: "Forget the visual for a moment. A PACT cell is a data structure — immutable, versioned, permanent. Understanding what's inside it changes how you think about AI output.",
    text: `Set aside the visual representation for a moment. If a PACT cell is a data structure 
rather than a chat message, what fields does it contain? What makes it an immutable artifact 
rather than an editable message?`,
  },
  {
    id: "07",
    title: "What is the notebook?",
    teaser: "Jupyter notebooks execute code and capture output. PACT notebooks execute reasoning and capture insight. The analogy runs deeper than it first appears.",
    text: `PACT is described as a computational notebook for reasoning. A Jupyter notebook contains 
cells that execute code and produce outputs. What is the equivalent in PACT — what executes, 
what is the output, and what makes the result reproducible?`,
  },
  {
    id: "08",
    title: "What should never reach the LLM?",
    teaser: "Not everything you want to say belongs in a prompt. Some messages should never reach the model at all — and PACT knows the difference.",
    text: `I want to tell PACT something that is not a question or a reasoning prompt — for example, 
that I am signing off for the day, or that the last response got garbled and I need it repeated. 
Why should these messages never be sent to the LLM as prompts, and what should handle them instead?`,
  },
  {
    id: "09",
    title: "What is a PACT signal?",
    teaser: "PACT introduces a new primitive: the signal. It's not a prompt, not a command — it's a typed control message that changes what the host does before the LLM is ever invoked.",
    text: `PACT introduces the concept of a signal — a typed control message that the host intercepts 
before the LLM is invoked. Give me three concrete examples of signals that would be useful in a 
session where a developer is using PACT to write code, and explain what the host does with each one.`,
  },
  {
    id: "10",
    title: "How does PACT compare two models?",
    teaser: "Same prompt. Two models. Two sibling cells. What you see when you put them side by side is something no browser tab comparison can show you.",
    text: `I submit the same prompt and PACT runs it against GPT and Claude simultaneously, displaying 
both responses as sibling cells. What does that comparison reveal that alternating between two 
browser tabs cannot? What would a diff overlay over those two cells show me?`,
  },
  {
    id: "11",
    title: "What would PACT remember that chat forgets?",
    teaser: "You close PACT after a long session and come back the next morning. Chat forgot everything. PACT forgot nothing — and what it retained is more structured than you might expect.",
    text: `After a long session developing a VSCode extension, I close PACT and return the next morning. 
What has a browser chat interface lost that PACT has retained? Be specific about what is stored, 
where, and in what form.`,
  },
  {
    id: "12",
    title: "What is a prompt library?",
    teaser: "A prompt in a library is not the same thing as a message in a chat history. The difference is subtle but it's the foundation of every structured reasoning workflow PACT enables.",
    text: `PACT maintains a library of prompts separate from the conversation history. What is the 
difference between a prompt in the library and a message in a chat history? Why does that 
difference matter for structured reasoning workflows?`,
  },
  {
    id: "13",
    title: "How does PACT apply to a domain?",
    teaser: "A medical professional. A patient's medications. One complete PACT session. By the end of this prompt you'll see exactly how PACT transforms domain expertise into structured, reproducible reasoning.",
    text: `Imagine a medical professional using PACT to investigate interactions between a patient's 
medications. Walk me through one complete PACT session in that domain — what prompts are submitted, 
what signals are used, what artifacts are produced, and what the notebook looks like at the end.`,
  },
  {
    id: "14",
    title: "Why is this not an agentic system?",
    teaser: "PACT gives the LLM no tools, no web access, no autonomous action. Every run is human-initiated. That's not a limitation — it's the most important design decision in the entire system.",
    text: `PACT gives the LLM no ability to take actions, browse the web, run code, or call tools 
autonomously. Every execution is initiated by the human. Why is that constraint a feature rather 
than a limitation, and what class of problems is PACT specifically designed to address?`,
  },
  {
    id: "15",
    title: "What does PACT become?",
    teaser: "PACT is being built using itself. A developer and an LLM, collaborating inside the notebook to build the notebook. What that bootstrapping process reveals about PACT's future is worth sitting with.",
    text: `PACT is currently being developed using itself — a developer and an LLM collaborating 
inside the notebook to build the notebook. What does that bootstrapping process demonstrate about 
PACT's long-term role, and what would it mean for a reasoning laboratory to become the standard 
environment for structured human-AI collaboration?`,
  },
];