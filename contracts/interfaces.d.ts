// Interfaces v1.3. Runtime is plain JavaScript. Existing APIs unchanged.
export type CurveKey = 'gr_api' | 'rhob_g_cm3' | 'rdep_ohm_m' | 'nphi_vv';
export interface Source {
  kind: 'synthetic' | 'public';
  label: string;
  url?: string;
  license?: string;
  licenses?: { curves: string; labels: string };
  retrievedAt?: string;
  files?: { name: string; sha256: string }[];
  seed?: number;
  citation?: string;
  modification?: string;
}
export interface WellDataset {
  schemaVersion: '1.0';
  id: string;
  wellId: string;
  depth_m: number[];
  curves: Partial<Record<CurveKey, (number | null)[]>>;
  units: Partial<Record<CurveKey, string>>;
  source: Source;
}
export interface SegReference {
  kind: 'synthetic';
  boundaryIndices: number[];
  boundaryDepths_m: number[];
  intervals: { start: number; end: number; label: string }[];
}
export interface PreparedSeries {
  featureKeys: CurveKey[];
  values: number[][]; // [sample][feature], z scores; rdep transformed with log10.
  transforms: { key: CurveKey; mean: number; std: number; log10: boolean }[];
}
export interface SegResult {
  boundaryIndices: number[]; // boundary b is between samples b-1 and b.
  segments: { start: number; end: number; means: number[] }[]; // [start,end)
  dataCost: number;
  objective: number; // average-feature SSE + penalty * number of boundaries.
  penalty: number;
  minSamples: number;
}
export interface BoundaryMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  mae_m: number | null;
  tolerance_m: number;
  matches: { predicted_m: number; reference_m: number; error_m: number }[];
  falsePositives_m: number[];
  falseNegatives_m: number[];
}
export interface WelllogSegCoreAPI {
  version: '1.0.0';
  makeSyntheticWell(options?: {
    seed?: number; noise?: number; preset?: 'standard' | 'thin' | 'spike';
  }): { dataset: WellDataset; reference: SegReference };
  prepareFeatures(dataset: WellDataset, keys: CurveKey[]): PreparedSeries;
  segment(values: number[][], options: { penalty: number; minSamples: number }): SegResult;
  gradientBaseline(values: number[][], options: {
    threshold: number; minSamples: number; windowSamples?: number;
  }): { boundaryIndices: number[]; scores: number[] };
  boundaryDepths(dataset: WellDataset, indices: number[]): number[];
  evaluate(predicted_m: number[], reference_m: number[], tolerance_m: number): BoundaryMetrics;
}
export interface Case01State {
  seed: number;
  preset: 'standard' | 'thin' | 'spike';
  noise: number;
  featureKeys: CurveKey[];
  penalty: number;
  minThickness_m: number;
  baselineThreshold: number;
  showReference: boolean;
  selectedDepth_m: number | null;
  selectedBoundaryIndex: number | null;
}
export interface PublicWellBatch {
  schemaVersion: '1.0';
  purpose?: 'illustration' | 'evaluation';
  selectionPolicy?: {
    version: string;
    usesHoldoutLabels: boolean;
    splitSeed: string;
    windowRule: string;
    classRule: string;
  };
  source: Source;
  split: { train: string[]; validation: string[]; test: string[] };
  wells: (WellDataset & {
    lithology?: (string | null)[]; // Mapped display class; excluded classes -> null.
    originalLithologyCode?: (number | null)[]; // Original raw code, preserved even if excluded.
    mappedLithologyCode?: (number | null)[]; // Explicit merged/filtered model class.
    originalDepthStep_m?: number | null;
  })[];
}

export type PublicWell = PublicWellBatch['wells'][number];
export interface FeatureTransform { key: CurveKey; mean: number; std: number; log10: boolean; }
export interface LithologyModel {
  version: '1.0.0'; featureKeys: CurveKey[]; transforms: FeatureTransform[];
  classCodes: number[]; samples: number[][]; codes: number[]; classCounts: number[];
  majorityCode: number; trainingWellIds: string[]; trainingSamples: number;
}
export interface LithologyPrediction {
  predictedCode: (number | null)[]; classCodes: number[];
  voteFractions: (number[] | null)[]; topVoteShare: (number | null)[];
  k: number; rejected: number;
}
export interface ClassificationMetrics {
  classCodes: number[]; matrix: number[][]; // c+1 rows/columns, final = unknown/rejected.
  perClass: {code: number; precision: number; recall: number; f1: number; support: number; predicted: number}[];
  macroF1: number | null; accuracy: number | null;
  evaluated: number; total: number; unknownReference: number; rejectedKnown: number;
  referenceCoverage: number | null; predictionCoverage: number | null;
  unknownPolicy: string;
}
export interface WelllogLithologyCoreAPI {
  version: '1.0.0';
  fitLithology(trainWells: PublicWell[], options?: {featureKeys?: CurveKey[]}): LithologyModel;
  predictLithology(dataset: WellDataset, model: LithologyModel, options?: {k?: number}): LithologyPrediction;
  predictMajority(dataset: WellDataset, model: LithologyModel): {classCodes: number[]; predictedCode: number[]};
  evaluateClassification(reference: (number | null)[], predicted: (number | null)[], classCodes: number[]): ClassificationMetrics;
}
export type GapKind = 'observed' | 'masked' | 'genuine';
export interface GapRegion {id: string; start: number; end: number; kind: 'masked' | 'genuine';}
export interface RepairMask {
  curve: 'gr_api'; flags: boolean[]; gapKind: GapKind[];
  gaps: GapRegion[]; // only masked; intervals [start,end).
  regions: GapRegion[]; // masked + genuine; no observed intervals.
  visible: WellDataset; // no masked GR values or lithology arrays.
  seed: string; blockSamples: number; requestedRatio: number; actualRatio: number;
  eligible: number; masked: number;
}
export interface RepairModel {
  version: '1.0.0'; target: 'gr_api'; featureKeys: CurveKey[]; transforms: FeatureTransform[];
  targetMean: number; coefficients: number[]; lambda: number;
  trainingSamples: number; trainingWellIds: string[];
}
export interface RepairResult {
  filled: (number | null)[]; method: 'linear' | 'ridge';
  params: {interpolation?: string; extrapolation?: boolean; lambda?: number; trainingWellIds?: string[]; featureKeys?: CurveKey[]};
}
export interface RepairMetrics {
  mae: number | null; rmse: number | null; r2: number | null;
  n: number; masked: number; coverage: number | null;
}
export interface RepairComparison {
  a: RepairMetrics; b: RepairMetrics; common: number; aBetter: number; bBetter: number; tied: number;
}
export interface WelllogRepairCoreAPI {
  version: '1.0.0';
  makeMask(dataset: WellDataset, options?: {curve?: 'gr_api'; ratio?: number; seed?: string; blockSamples?: number}): RepairMask;
  fitRepair(trainWells: WellDataset[], options?: {lambda?: number}): RepairModel;
  repairCurve(visible: WellDataset, mask: Pick<RepairMask,'flags'|'gapKind'>, options?: {method?: 'linear' | 'ridge'; model?: RepairModel}): RepairResult;
  evaluateRepair(truth: (number | null)[], predicted: (number | null)[], flags: boolean[]): RepairMetrics;
  compareRepairs(truth: (number | null)[], a: (number | null)[], b: (number | null)[], flags: boolean[]): RepairComparison;
}
export interface PublicDemoData {
  schemaVersion: '1.0'; datasetSha256: string; batch: PublicWellBatch;
  classes: {code: number; name: string}[];
  defaults: {lithology: {k: number; featureKeys: CurveKey[]}; repair: {
    lambda: number; curve: 'gr_api'; ratio: number; seed: string; blockSamples: number;
  }};
}

export interface PorosityCalibration {sampleIndex: number; porosity_vv: number;}
export interface PorosityTrainingWell {dataset: WellDataset; calibration: PorosityCalibration[];}
export interface PorosityExperiment {
  seed: number; scenario: 'standard' | 'shift'; train: PorosityTrainingWell[];
  target: {dataset: WellDataset; reference: {kind: 'synthetic'; porosity_vv: number[]}};
}
export interface PorosityModel {
  version: '1.0.0'; featureKeys: CurveKey[];
  transforms: (FeatureTransform & {min: number; max: number})[];
  samples: number[][]; labels: number[];
  positions: {wellId: string; sampleIndex: number}[];
  trainingWellIds: string[]; trainingSamples: number;
}
export interface PorosityPrediction {
  predicted_vv: (number | null)[]; localSpread_vv: (number | null)[];
  outsideTrainingRange: (boolean | null)[]; k: number;
}
export interface RegressionMetrics {
  mae_pp: number | null; rmse_pp: number | null; bias_pp: number | null; r2: number | null;
  n: number; total: number; coverage: number | null;
}
export interface WelllogPorosityCoreAPI {
  version: '1.0.0';
  makeExperiment(options?: {seed?: number; noise?: number; scenario?: 'standard' | 'shift'}): PorosityExperiment;
  selectCalibration(train: PorosityTrainingWell[], options?: {perWell?: number}): PorosityTrainingWell[];
  fitPorosity(train: PorosityTrainingWell[], options?: {perWell?: number; featureKeys?: CurveKey[]}): PorosityModel;
  predictPorosity(dataset: WellDataset, model: PorosityModel, options?: {k?: number}): PorosityPrediction;
  densityBaseline(dataset: WellDataset, options?: {matrixDensity?: number; fluidDensity?: number}): {
    predicted_vv: (number | null)[]; matrixDensity: number; fluidDensity: number;
  };
  evaluateRegression(reference: (number | null)[], predicted: (number | null)[]): RegressionMetrics;
}
export interface Sinusoid {id?: string; centerRow: number; amplitude_px: number; phase_deg: number;}
export interface BoreholeImage {
  width: number; height: number; pixels: (number | null)[]; // row-major, grayscale 0..1; null unobserved.
  depthTop_m: number; depthStep_m: number; azimuthOrigin_deg: number; source: Source;
}
export interface FractureReference {kind: 'synthetic'; fractures: Sinusoid[]; distractors: Sinusoid[];}
export interface PreparedImage {
  width: number; height: number; strength: (number | null)[]; validPixels: number; totalPixels: number;
}
export interface FractureCandidate extends Sinusoid {id: string; score: number; support: number; validColumns: number;}
export interface FractureSearch {
  candidates: FractureCandidate[]; coarseCount: number;
  grid: {centerStep_px: number; amplitudeStep_px: number; phaseStep_deg: number}; nmsDistance_px: number;
}
export interface DetectionMetrics {
  tp: number; fp: number; fn: number; precision: number | null; recall: number | null; f1: number | null;
  meanDistance_px: number | null;
  matches: {predictedIndex: number; referenceIndex: number; distance_px: number; centerError_px: number}[];
  falsePositiveIndices: number[]; falseNegativeIndices: number[];
  centerTolerance_px: number; trajectoryTolerance_px: number;
}
export interface WelllogFractureCoreAPI {
  version: '1.0.0';
  makeImage(options?: {seed?: number; noise?: number; visibility?: number; preset?: 'standard' | 'occluded' | 'bedding'}): {
    image: BoreholeImage; reference: FractureReference;
  };
  prepareImage(image: BoreholeImage): PreparedImage;
  searchSinusoids(prepared: PreparedImage): FractureSearch;
  selectCandidates(search: FractureSearch, options?: {threshold?: number; maxCandidates?: number}): FractureCandidate[];
  trajectory(candidate: Sinusoid, width: number): number[];
  trajectoryDistance(a: Sinusoid, b: Sinusoid): number;
  evaluateDetections(predicted: Sinusoid[], referenceFractures: Sinusoid[], options?: {
    centerTolerance_px?: number; trajectoryTolerance_px?: number;
  }): DetectionMetrics;
}
