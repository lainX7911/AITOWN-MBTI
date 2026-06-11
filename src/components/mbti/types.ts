export type Axis = 'ei' | 'sn' | 'tf' | 'jp';

export type MbtiWeights = {
  e: number;
  i: number;
  s: number;
  n: number;
  t: number;
  f: number;
  j: number;
  p: number;
};

export type BehaviorWeights = {
  socialInitiation: number;
  withdrawal: number;
  factChecking: number;
  meaningProjection: number;
  logicFraming: number;
  emotionalSensitivity: number;
  closureNeed: number;
  openness: number;
  repairDrive: number;
  rumination: number;
};

export type Profile = {
  code: string;
  weights: MbtiWeights;
  behaviors: BehaviorWeights;
};

export type TestAnswer = {
  axis: Axis;
  prompt: string;
  example: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
};

export type Scenario = {
  id: string;
  title: string;
  question: string;
  pressure: {
    ambiguity: number;
    intimacy: number;
    conflict: number;
    publicness: number;
    timePressure: number;
  };
};

export type ActorRole = 'partner' | 'friend' | 'coworker' | 'family' | 'ex' | 'ambiguous' | 'other';

export type SocialActor = {
  id: string;
  role: ActorRole;
  label: string;
  weights: Partial<MbtiWeights>;
  tendency: string;
};

export type RolePreset = {
  enabled: boolean;
  role: ActorRole;
  label: string;
  mapping: string;
  mbtiCode: string;
  traits: string;
  reason: string;
};

export type SimulationRun = {
  id: number;
  scenarioTitle: string;
  partner: SocialActor;
  friend: SocialActor;
  action: string;
  outcome: string;
  confidence: number;
  trace: string[];
  stress: number;
  repair: number;
  chat: Array<{ speaker: string; text: string }>;
  events: string[];
  innerThoughts: string[];
};

export type SimulationReport = {
  runs: SimulationRun[];
  distribution: Array<{ action: string; count: number; percent: number }>;
  stableTendencies: string[];
  conditionalTriggers: string[];
  counterexamples: SimulationRun[];
};
