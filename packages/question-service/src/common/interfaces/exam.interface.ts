export type ExamStatus =
  | 'created'
  | 'blueprint_defined'
  | 'matrix_generating'
  | 'matrix_ready'
  | 'encrypting'
  | 'encrypted'
  | 'distributing'
  | 'ready'
  | 'active'
  | 'completed'
  | 'grading'
  | 'results_published';

export interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface TopicCoverage {
  topic: string;
  subtopics: string[];
  questionCount: number;
  weight: number;
}

export interface ExamBlueprint {
  difficultyDist: DifficultyDistribution;
  topicCoverage: TopicCoverage[];
  questionsPerPaper: number;
}

export interface ExamMetadata {
  name: string;
  date: string;
  subjects: string[];
  totalQuestions: number;
  totalCandidates: number;
  status: ExamStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface Exam {
  id: string;
  metadata: ExamMetadata;
  blueprint: ExamBlueprint | null;
}
