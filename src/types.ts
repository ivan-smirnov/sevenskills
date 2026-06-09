export type SkillId =
  | "reflection"
  | "critical"
  | "body"
  | "relationships"
  | "adaptability"
  | "emotions"
  | "belief";

export type ConcernId =
  | "burnout"
  | "anxiety"
  | "relationships"
  | "selfworth"
  | "mood"
  | "decisions"
  | "crisis";

export type Skill = {
  id: SkillId;
  name: string;
  shortName: string;
  description: string;
  color: string;
  tint: string;
  requests: string[];
};

export type Concern = {
  id: ConcernId;
  title: string;
  caption: string;
  relatedSkills: SkillId[];
  isCrisis?: boolean;
};

export type Question = {
  id: string;
  skillId?: SkillId;
  text: string;
  lowLabel: string;
  highLabel: string;
  isCrisisSignal?: boolean;
};

export type SkillScores = Record<SkillId, number>;

export type UserProfile = {
  concernId: ConcernId;
  scores: SkillScores;
  strongestSkill: SkillId;
  growthSkill: SkillId;
  recommendedRoute: SkillId[];
  createdAt: string;
  safetyMode?: boolean;
};

export type Lesson = {
  id: string;
  skillId: SkillId;
  level: number;
  title: string;
  duration: string;
  summary: string;
  concept: string;
  example: string;
  exercise: {
    prompt: string;
    choices: Array<{
      text: string;
      feedback: string;
      supportive?: boolean;
    }>;
  };
  reflectionPrompt: string;
  actionPrompt: string;
};

export type CheckIn = {
  lessonId: string;
  skillId: SkillId;
  title: string;
  reflection: string;
  action: string;
  date: string;
};

export type Progress = {
  completedLessonIds: string[];
  streak: number;
  lastPracticeDate?: string;
  checkIns: CheckIn[];
};
