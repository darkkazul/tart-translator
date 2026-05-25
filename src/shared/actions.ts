// Single source of truth for the imperative action verbs the pipeline recognizes.
// Both the classifier (what becomes a procedure) and the note generator (what
// becomes a step) build their regexes from this list, so they can never drift.
//
// Ordering rule: keep multiword starters before any single-word prefix they share
// (e.g. "head over to" / "head to" before a bare "head", "go to" before a bare
// "go"). Regex alternation is first-match, so a bare prefix listed first would
// shadow the longer phrase.
export const ACTION_STARTER_SOURCE =
  "open|go to|head over to|head to|navigate to|visit|click|hit|press|tap|select|choose|save|copy|paste|run|restart|check|verify|make sure|set|create|delete|update|export|import|add|remove|enter|type|upload|download|wait";
