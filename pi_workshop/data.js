/* π₀ Workshop — shared data / math library
 *
 * Skeleton owned by Build Agent A (page shells).
 * Build Agents B and C populate the per-viz fixtures listed below.
 *
 * Each viz module reads from window.PiData. Add fields here, don't fork.
 *
 * Suggested top-level keys (agents B/C may add more):
 *   PiData.attnToyTokens     — viz A1: 8 toy tokens with (Q,K,V) embeddings
 *   PiData.mhaPatterns       — viz A2: hand-authored 4-head attention matrices
 *                              for "the red cube is to the left of the blue cube"
 *   PiData.causalMaskN       — viz M1: default token count
 *   PiData.transformerSteps  — viz D2: ordered list of {name, shape, tensor}
 *   PiData.imagePatchScene   — viz P1: SVG-coordinate scene description
 *   PiData.pi0Sequence       — viz P2: layout = [img×16, text×6, state×1, action×8]
 *   PiData.pi0Diagram        — viz D1: box positions + labels for the SVG diagram
 *   PiData.flowChunk         — viz F1: target action chunk (smooth ground-truth) +
 *                              precomputed denoising trajectory
 *   PiData.familyComparison  — viz CMP: AR vs flow side-by-side wall-clock numbers
 *                              (mark schematic; verify against papers in QA)
 *   PiData.kiModes           — viz KI1: {pretrain π₀, finetune π₀,
 *                                       KI π₀.5 train, KI π₀.5 inference}
 *                              Each → which boxes are frozen/trained, which arrows visible
 *   PiData.dataMixture       — viz data-mixture (page 5): stacked-bar fractions
 *                              for π₀ vs π₀.5 (lab / cross-embodiment / web / subtask-lang)
 *   PiData.runtimeRace       — viz R1: AR steps vs flow steps + schematic ms each
 *
 * Numerical placeholders should be marked  __TODO_AGENT_B__ or __TODO_AGENT_C__.
 * Quoted latency / param-count numbers should match the source markdowns
 * (agent1, agent2) — never invent.
 */
(function (global) {
  'use strict';

  // Empty container — agents B/C will populate.
  // Build Agent A only seeds the namespace.
  var PiData = {};

  // ----- Shape constants used across multiple viz (safe to populate now) -----
  // π₀ paper §IV: H = 50 timesteps per chunk; D = 18 (largest robot in dataset).
  PiData.CHUNK_T = 50;
  PiData.CHUNK_D_MODEL = 18;       // model-side action dimensionality
  PiData.CHUNK_D_UR5 = 7;          // single-arm UR5e native dim
  PiData.CHUNK_D_BIMANUAL = 14;    // bimanual ALOHA-style native dim
  PiData.FLOW_STEPS = 10;          // π₀ paper §IV: 10 Euler steps at δ=0.1

  // π₀ paper §IV / §B: backbone is PaliGemma (~3.0B) + action expert (~300M).
  PiData.BACKBONE_PARAMS = 3.0e9;
  PiData.EXPERT_PARAMS = 0.3e9;

  // π₀ paper §B (Gemma-2B config, kept here for D2 transformer-block diagram):
  PiData.BACKBONE_WIDTH = 2048;
  PiData.BACKBONE_DEPTH = 18;
  PiData.BACKBONE_MLP_DIM = 16384;
  PiData.BACKBONE_HEADS = 18;
  PiData.BACKBONE_HEAD_DIM = 256;
  PiData.EXPERT_WIDTH = 1024;
  PiData.EXPERT_MLP_DIM = 4096;

  // π₀.5 (arXiv 2504.16054) eval scope — agent2_pi_zero_5_mechanics §7
  PiData.PI05_EVAL_HOMES = 3;          // unseen homes in the main eval
  PiData.PI05_PRETRAIN_HOMES = 104;    // pretraining mobile-manip diversity

  // π₀-FAST ~750ms per chunk (FAST §VI-D); π₀ flow ~73ms on-board (π₀ §D Table I).
  // CMP / R1 may use these — they are MEASURED, not schematic.
  PiData.LATENCY_PI0_FLOW_MS = 73;
  PiData.LATENCY_PI0_FAST_MS = 750;

  // ------------------------------------------------------------------
  // Export
  // ------------------------------------------------------------------
  global.PiData = PiData;

})(typeof window !== 'undefined' ? window : this);
