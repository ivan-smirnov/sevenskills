import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BatteryMedium,
  Brain,
  CheckCircle2,
  ChevronLeft,
  Flame,
  HeartPulse,
  Home,
  Lightbulb,
  Map,
  MessageCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { concerns, lessons, questions, skillOrder, skills } from "./data";
import type { CheckIn, ConcernId, Lesson, Progress, Skill, SkillId, SkillScores, UserProfile } from "./types";

type View = "today" | "map" | "profile" | "progress";
type OnboardingStep = "concern" | "questions" | "result";

const profileKey = "prosebya.profile.v1";
const progressKey = "prosebya.progress.v1";

const defaultProgress: Progress = {
  completedLessonIds: [],
  streak: 0,
  checkIns: [],
};

const skillIconMap: Record<SkillId, typeof Brain> = {
  reflection: Sparkles,
  critical: Brain,
  body: HeartPulse,
  relationships: Users,
  adaptability: Waves,
  emotions: BatteryMedium,
  belief: ShieldCheck,
};

const navItems: Array<{ view: View; label: string; icon: typeof Home }> = [
  { view: "today", label: "Сегодня", icon: Home },
  { view: "map", label: "Карта", icon: Map },
  { view: "progress", label: "Прогресс", icon: BarChart3 },
  { view: "profile", label: "Профиль", icon: Sparkles },
];

const todayKey = () => new Date().toISOString().slice(0, 10);

const daysBetween = (dateA: string, dateB: string) => {
  const start = new Date(`${dateA}T00:00:00`);
  const end = new Date(`${dateB}T00:00:00`);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
};

const getSkill = (id: SkillId) => skills.find((skill) => skill.id === id)!;
const getConcern = (id: ConcernId) => concerns.find((concern) => concern.id === id)!;
const lessonsForSkill = (skillId: SkillId) => lessons.filter((lesson) => lesson.skillId === skillId);

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function calculateProfile(concernId: ConcernId, answers: Record<string, number>): UserProfile {
  const scores = skillOrder.reduce((accumulator, skillId) => {
    const values = questions
      .filter((question) => question.skillId === skillId)
      .map((question) => answers[question.id] ?? 3);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    accumulator[skillId] = Number(average.toFixed(1));
    return accumulator;
  }, {} as SkillScores);

  const strongestSkill = [...skillOrder].sort((a, b) => scores[b] - scores[a])[0];
  const growthSkill = [...skillOrder].sort((a, b) => scores[a] - scores[b])[0];
  const concern = getConcern(concernId);
  const route = [...concern.relatedSkills, ...skillOrder.filter((skillId) => !concern.relatedSkills.includes(skillId))]
    .sort((a, b) => {
      const concernWeight = Number(concern.relatedSkills.includes(b)) - Number(concern.relatedSkills.includes(a));
      if (concernWeight !== 0) return concernWeight;
      return scores[a] - scores[b];
    })
    .slice(0, 4);

  const safetyMode = Boolean(concern.isCrisis || (answers["safety-signal"] ?? 1) >= 4);

  return {
    concernId,
    scores,
    strongestSkill,
    growthSkill,
    recommendedRoute: route,
    createdAt: new Date().toISOString(),
    safetyMode,
  };
}

function getRecommendedLesson(profile: UserProfile, progress: Progress) {
  const routeLessons = profile.recommendedRoute.flatMap(lessonsForSkill);
  return routeLessons.find((lesson) => !progress.completedLessonIds.includes(lesson.id)) ?? routeLessons[0] ?? lessons[0];
}

function App() {
  const [profile, setProfile] = useState<UserProfile | null>(() => readStorage<UserProfile | null>(profileKey, null));
  const [progress, setProgress] = useState<Progress>(() => readStorage<Progress>(progressKey, defaultProgress));
  const [activeView, setActiveView] = useState<View>("today");
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  useEffect(() => {
    if (profile) localStorage.setItem(profileKey, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(progressKey, JSON.stringify(progress));
  }, [progress]);

  const completedCountBySkill = useMemo(() => {
    return skillOrder.reduce(
      (accumulator, skillId) => {
        accumulator[skillId] = lessonsForSkill(skillId).filter((lesson) => progress.completedLessonIds.includes(lesson.id)).length;
        return accumulator;
      },
      {} as Record<SkillId, number>,
    );
  }, [progress.completedLessonIds]);

  const completeLesson = (lesson: Lesson, reflection: string, action: string) => {
    const today = todayKey();
    const nextCompleted = progress.completedLessonIds.includes(lesson.id)
      ? progress.completedLessonIds
      : [...progress.completedLessonIds, lesson.id];
    const nextStreak =
      progress.lastPracticeDate === today
        ? progress.streak
        : progress.lastPracticeDate && daysBetween(progress.lastPracticeDate, today) === 1
          ? progress.streak + 1
          : 1;
    const nextCheckIn: CheckIn = {
      lessonId: lesson.id,
      skillId: lesson.skillId,
      title: lesson.title,
      reflection,
      action,
      date: new Date().toISOString(),
    };

    setProgress({
      completedLessonIds: nextCompleted,
      streak: nextStreak,
      lastPracticeDate: today,
      checkIns: [nextCheckIn, ...progress.checkIns].slice(0, 8),
    });
    setActiveLesson(null);
    setActiveView("today");
  };

  const resetPrototype = () => {
    localStorage.removeItem(profileKey);
    localStorage.removeItem(progressKey);
    setProfile(null);
    setProgress(defaultProgress);
    setActiveLesson(null);
    setActiveView("today");
  };

  if (!profile) {
    return <Onboarding onComplete={setProfile} />;
  }

  if (profile.safetyMode) {
    return <SafetyScreen onReset={resetPrototype} />;
  }

  if (activeLesson) {
    return <LessonScreen lesson={activeLesson} onBack={() => setActiveLesson(null)} onComplete={completeLesson} />;
  }

  const recommendedLesson = getRecommendedLesson(profile, progress);

  return (
    <div className="appShell">
      <aside className="sideRail" aria-label="Основная навигация">
        <div className="brandMark">
          <span className="brandIcon">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>Просебя</strong>
            <span>навыки</span>
          </div>
        </div>
        <nav className="railNav">
          {navItems.map((item) => (
            <NavButton key={item.view} item={item} isActive={activeView === item.view} onClick={() => setActiveView(item.view)} />
          ))}
        </nav>
      </aside>

      <main className="appMain">
        <TopBar progress={progress} profile={profile} />
        {activeView === "today" && (
          <TodayView
            profile={profile}
            progress={progress}
            recommendedLesson={recommendedLesson}
            completedCountBySkill={completedCountBySkill}
            onStartLesson={setActiveLesson}
            onViewMap={() => setActiveView("map")}
          />
        )}
        {activeView === "map" && (
          <SkillMapView
            profile={profile}
            progress={progress}
            completedCountBySkill={completedCountBySkill}
            onStartLesson={setActiveLesson}
          />
        )}
        {activeView === "profile" && <ProfileView profile={profile} onReset={resetPrototype} />}
        {activeView === "progress" && <ProgressView profile={profile} progress={progress} completedCountBySkill={completedCountBySkill} />}
      </main>

      <nav className="bottomNav" aria-label="Основная навигация">
        {navItems.map((item) => (
          <NavButton key={item.view} item={item} isActive={activeView === item.view} onClick={() => setActiveView(item.view)} />
        ))}
      </nav>
    </div>
  );
}

function NavButton({
  item,
  isActive,
  onClick,
}: {
  item: { view: View; label: string; icon: typeof Home };
  isActive: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button className={`navButton ${isActive ? "isActive" : ""}`} type="button" onClick={onClick} aria-current={isActive ? "page" : undefined}>
      <Icon size={19} aria-hidden="true" />
      <span>{item.label}</span>
    </button>
  );
}

function Onboarding({ onComplete }: { onComplete: (profile: UserProfile) => void }) {
  const [step, setStep] = useState<OnboardingStep>("concern");
  const [selectedConcern, setSelectedConcern] = useState<ConcernId>("burnout");
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    questions.reduce(
      (accumulator, question) => {
        accumulator[question.id] = question.isCrisisSignal ? 1 : 3;
        return accumulator;
      },
      {} as Record<string, number>,
    ),
  );

  const previewProfile = useMemo(() => calculateProfile(selectedConcern, answers), [selectedConcern, answers]);

  const handleComplete = () => {
    onComplete(previewProfile);
  };

  return (
    <main className="onboardingShell">
      <section className="onboardingPanel" aria-labelledby="onboarding-title">
        <div className="brandMark onboardingBrand">
          <span className="brandIcon">
            <Sparkles size={20} aria-hidden="true" />
          </span>
          <div>
            <strong>Просебя</strong>
            <span>ежедневная практика</span>
          </div>
        </div>

        {step === "concern" && (
          <div className="onboardingContent">
            <p className="eyebrow">Шаг 1 из 3</p>
            <h1 id="onboarding-title">С чего начнем сегодня?</h1>
            <p className="leadText">Выбери актуальный запрос. Прототип соберет первый маршрут по навыкам.</p>
            <div className="concernGrid">
              {concerns.map((concern) => {
                const isSelected = selectedConcern === concern.id;
                return (
                  <button
                    className={`concernCard ${isSelected ? "isSelected" : ""} ${concern.isCrisis ? "isCrisis" : ""}`}
                    key={concern.id}
                    type="button"
                    onClick={() => setSelectedConcern(concern.id)}
                  >
                    <span>{concern.title}</span>
                    <small>{concern.caption}</small>
                  </button>
                );
              })}
            </div>
            <button className="primaryButton" type="button" onClick={() => setStep("questions")}>
              <span>Продолжить</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {step === "questions" && (
          <div className="onboardingContent">
            <p className="eyebrow">Шаг 2 из 3</p>
            <h1>Короткий опросник</h1>
            <p className="leadText">Ответы сохраняются только в этом браузере и нужны для подбора первого маршрута.</p>
            <div className="questionList">
              {questions.map((question) => (
                <div className={`questionRow ${question.isCrisisSignal ? "safetyQuestion" : ""}`} key={question.id}>
                  <div>
                    <strong>{question.text}</strong>
                    <div className="scaleLabels">
                      <span>{question.lowLabel}</span>
                      <span>{question.highLabel}</span>
                    </div>
                  </div>
                  <div className="scaleButtons" role="group" aria-label={question.text}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        className={answers[question.id] === value ? "isPicked" : ""}
                        key={value}
                        type="button"
                        onClick={() => setAnswers({ ...answers, [question.id]: value })}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="buttonRow">
              <button className="secondaryButton" type="button" onClick={() => setStep("concern")}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Назад</span>
              </button>
              <button className="primaryButton" type="button" onClick={() => setStep("result")}>
                <span>Показать профиль</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {step === "result" && (
          <div className="onboardingContent">
            <p className="eyebrow">Шаг 3 из 3</p>
            <h1>{previewProfile.safetyMode ? "Сначала безопасность" : "Первый маршрут готов"}</h1>
            {previewProfile.safetyMode ? (
              <div className="safetyInline">
                <AlertTriangle size={22} aria-hidden="true" />
                <p>По ответам здесь важнее живая поддержка, чем тренировка навыков. Следующий экран покажет безопасный сценарий.</p>
              </div>
            ) : (
              <ProfileSummary profile={previewProfile} compact />
            )}
            <div className="buttonRow">
              <button className="secondaryButton" type="button" onClick={() => setStep("questions")}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Назад</span>
              </button>
              <button className="primaryButton" type="button" onClick={handleComplete}>
                <span>Открыть приложение</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function SafetyScreen({ onReset }: { onReset: () => void }) {
  return (
    <main className="safetyShell">
      <section className="safetyPanel" aria-labelledby="safety-title">
        <div className="safetyIcon">
          <AlertTriangle size={28} aria-hidden="true" />
        </div>
        <p className="eyebrow">Бережный сценарий</p>
        <h1 id="safety-title">Сейчас важнее не урок, а поддержка рядом</h1>
        <p>
          Этот прототип не является экстренной помощью и не заменяет специалиста. Если есть риск причинить себе вред прямо
          сейчас, обратись в экстренные службы своего региона или к человеку, который может быть рядом физически.
        </p>
        <p>
          Если непосредственной опасности нет, все равно стоит написать близкому человеку, связаться с психологом, врачом или
          кризисной службой. Практики можно продолжать позже, когда станет безопаснее.
        </p>
        <button className="secondaryButton" type="button" onClick={onReset}>
          <RotateCcw size={18} aria-hidden="true" />
          <span>Пройти заново</span>
        </button>
      </section>
    </main>
  );
}

function TopBar({ profile, progress }: { profile: UserProfile; progress: Progress }) {
  const concern = getConcern(profile.concernId);
  return (
    <header className="topBar">
      <div>
        <p className="eyebrow">Сегодня</p>
        <h1>{concern.title}</h1>
      </div>
      <div className="topStats" aria-label="Текущий прогресс">
        <span>
          <Flame size={17} aria-hidden="true" />
          {progress.streak}
        </span>
        <span>
          <Trophy size={17} aria-hidden="true" />
          {progress.completedLessonIds.length}
        </span>
      </div>
    </header>
  );
}

function TodayView({
  profile,
  progress,
  recommendedLesson,
  completedCountBySkill,
  onStartLesson,
  onViewMap,
}: {
  profile: UserProfile;
  progress: Progress;
  recommendedLesson: Lesson;
  completedCountBySkill: Record<SkillId, number>;
  onStartLesson: (lesson: Lesson) => void;
  onViewMap: () => void;
}) {
  const skill = getSkill(recommendedLesson.skillId);
  const Icon = skillIconMap[skill.id];
  const completion = Math.round((progress.completedLessonIds.length / lessons.length) * 100);

  return (
    <div className="viewStack">
      <section className="dailyBand" style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}>
        <div className="lessonBadge">
          <Icon size={24} aria-hidden="true" />
        </div>
        <div className="dailyText">
          <p className="eyebrow">Практика дня · {recommendedLesson.duration}</p>
          <h2>{recommendedLesson.title}</h2>
          <p>{recommendedLesson.summary}</p>
        </div>
        <button className="primaryButton" type="button" onClick={() => onStartLesson(recommendedLesson)}>
          <span>Начать</span>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Маршрут</p>
          <h2>Твои ближайшие навыки</h2>
        </div>
        <button className="iconTextButton" type="button" onClick={onViewMap}>
          <Map size={18} aria-hidden="true" />
          <span>Карта</span>
        </button>
      </section>

      <div className="routeGrid">
        {profile.recommendedRoute.map((skillId, index) => (
          <SkillRouteCard
            key={skillId}
            skill={getSkill(skillId)}
            order={index + 1}
            completedCount={completedCountBySkill[skillId]}
            onStartLesson={onStartLesson}
            progress={progress}
          />
        ))}
      </div>

      <section className="progressBand">
        <div>
          <p className="eyebrow">Общий прогресс</p>
          <h2>{completion}% практик пройдено</h2>
        </div>
        <div className="wideProgress" aria-label={`Пройдено ${completion}%`}>
          <span style={{ width: `${completion}%` }} />
        </div>
      </section>
    </div>
  );
}

function SkillRouteCard({
  skill,
  order,
  completedCount,
  progress,
  onStartLesson,
}: {
  skill: Skill;
  order: number;
  completedCount: number;
  progress: Progress;
  onStartLesson: (lesson: Lesson) => void;
}) {
  const Icon = skillIconMap[skill.id];
  const nextLesson = lessonsForSkill(skill.id).find((lesson) => !progress.completedLessonIds.includes(lesson.id)) ?? lessonsForSkill(skill.id)[0];

  return (
    <article className="skillCard" style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}>
      <div className="skillCardTop">
        <span className="skillOrder">{order}</span>
        <span className="skillIcon">
          <Icon size={21} aria-hidden="true" />
        </span>
      </div>
      <h3>{skill.name}</h3>
      <p>{skill.description}</p>
      <div className="miniProgress" aria-label={`${completedCount} из 3 уроков пройдено`}>
        {[0, 1, 2].map((item) => (
          <span key={item} className={item < completedCount ? "isDone" : ""} />
        ))}
      </div>
      <button className="secondaryButton compactButton" type="button" onClick={() => onStartLesson(nextLesson)}>
        <span>{nextLesson.title}</span>
        <ArrowRight size={17} aria-hidden="true" />
      </button>
    </article>
  );
}

function SkillMapView({
  profile,
  progress,
  completedCountBySkill,
  onStartLesson,
}: {
  profile: UserProfile;
  progress: Progress;
  completedCountBySkill: Record<SkillId, number>;
  onStartLesson: (lesson: Lesson) => void;
}) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Карта навыков</p>
          <h2>Семь веток «Просебя»</h2>
        </div>
      </section>
      <div className="skillMapGrid">
        {skills.map((skill) => {
          const Icon = skillIconMap[skill.id];
          const isRecommended = profile.recommendedRoute.includes(skill.id);
          return (
            <article
              className={`mapCard ${isRecommended ? "isRecommended" : ""}`}
              key={skill.id}
              style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}
            >
              <div className="mapCardHeader">
                <span className="skillIcon">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="mapScore">{profile.scores[skill.id].toFixed(1)}</span>
              </div>
              <h3>{skill.name}</h3>
              <p>{skill.description}</p>
              <div className="lessonList">
                {lessonsForSkill(skill.id).map((lesson) => {
                  const isDone = progress.completedLessonIds.includes(lesson.id);
                  return (
                    <button className={isDone ? "lessonPill isDone" : "lessonPill"} key={lesson.id} type="button" onClick={() => onStartLesson(lesson)}>
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <span>{lesson.title}</span>
                    </button>
                  );
                })}
              </div>
              <div className="miniProgress" aria-label={`${completedCountBySkill[skill.id]} из 3 уроков пройдено`}>
                {[0, 1, 2].map((item) => (
                  <span key={item} className={item < completedCountBySkill[skill.id] ? "isDone" : ""} />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ProfileView({ profile, onReset }: { profile: UserProfile; onReset: () => void }) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Ментальный профиль</p>
          <h2>Карта сильных и развиваемых навыков</h2>
        </div>
      </section>
      <ProfileSummary profile={profile} />
      <section className="scoreGrid" aria-label="Баллы навыков">
        {skills.map((skill) => (
          <div className="scoreRow" key={skill.id} style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}>
            <div>
              <strong>{skill.name}</strong>
              <span>{skill.requests.slice(0, 2).join(" · ")}</span>
            </div>
            <div className="scoreMeter" aria-label={`${skill.name}: ${profile.scores[skill.id]} из 5`}>
              <span style={{ width: `${(profile.scores[skill.id] / 5) * 100}%` }} />
            </div>
            <b>{profile.scores[skill.id].toFixed(1)}</b>
          </div>
        ))}
      </section>
      <button className="secondaryButton resetButton" type="button" onClick={onReset}>
        <RotateCcw size={18} aria-hidden="true" />
        <span>Сбросить прототип</span>
      </button>
    </div>
  );
}

function ProfileSummary({ profile, compact = false }: { profile: UserProfile; compact?: boolean }) {
  const concern = getConcern(profile.concernId);
  const strong = getSkill(profile.strongestSkill);
  const growth = getSkill(profile.growthSkill);

  return (
    <section className={compact ? "profileSummary compactSummary" : "profileSummary"}>
      <div>
        <p className="eyebrow">Запрос</p>
        <h2>{concern.title}</h2>
        <p>{concern.caption}</p>
      </div>
      <div className="summaryColumns">
        <div style={{ "--accent": strong.color, "--tint": strong.tint } as React.CSSProperties}>
          <Sparkles size={20} aria-hidden="true" />
          <span>Сильная зона</span>
          <strong>{strong.name}</strong>
        </div>
        <div style={{ "--accent": growth.color, "--tint": growth.tint } as React.CSSProperties}>
          <Lightbulb size={20} aria-hidden="true" />
          <span>Зона развития</span>
          <strong>{growth.name}</strong>
        </div>
      </div>
    </section>
  );
}

function ProgressView({
  profile,
  progress,
  completedCountBySkill,
}: {
  profile: UserProfile;
  progress: Progress;
  completedCountBySkill: Record<SkillId, number>;
}) {
  const badges = [
    {
      title: "Первый шаг",
      text: "Пройти одну практику",
      active: progress.completedLessonIds.length >= 1,
    },
    {
      title: "Три дня внимания",
      text: "Серия из 3 дней",
      active: progress.streak >= 3,
    },
    {
      title: "Маршрут начат",
      text: "Завершить 4 практики",
      active: progress.completedLessonIds.length >= 4,
    },
  ];

  return (
    <div className="viewStack">
      <section className="progressOverview">
        <div>
          <p className="eyebrow">Бережный прогресс</p>
          <h2>{progress.streak} дней в серии</h2>
          <p>Если серия прервется, маршрут останется на месте. Здесь важна возвращаемость, а не идеальность.</p>
        </div>
        <div className="progressNumber">
          <strong>{progress.completedLessonIds.length}</strong>
          <span>практик</span>
        </div>
      </section>

      <div className="badgeGrid">
        {badges.map((badge) => (
          <article className={`badgeCard ${badge.active ? "isActive" : ""}`} key={badge.title}>
            <Trophy size={22} aria-hidden="true" />
            <strong>{badge.title}</strong>
            <span>{badge.text}</span>
          </article>
        ))}
      </div>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Ветки</p>
          <h2>Что уже потренировано</h2>
        </div>
      </section>
      <div className="progressSkillList">
        {profile.recommendedRoute.map((skillId) => {
          const skill = getSkill(skillId);
          return (
            <div className="progressSkillRow" key={skillId} style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}>
              <span>{skill.name}</span>
              <div className="wideProgress">
                <span style={{ width: `${(completedCountBySkill[skillId] / 3) * 100}%` }} />
              </div>
              <b>{completedCountBySkill[skillId]}/3</b>
            </div>
          );
        })}
      </div>

      <section className="sectionHeader">
        <div>
          <p className="eyebrow">Последние заметки</p>
          <h2>Микрорефлексия</h2>
        </div>
      </section>
      <div className="checkInList">
        {progress.checkIns.length === 0 ? (
          <p className="emptyText">После первого урока здесь появится короткая запись.</p>
        ) : (
          progress.checkIns.map((checkIn) => (
            <article className="checkInCard" key={`${checkIn.lessonId}-${checkIn.date}`}>
              <span>{getSkill(checkIn.skillId).name}</span>
              <strong>{checkIn.title}</strong>
              <p>{checkIn.reflection}</p>
              <small>{checkIn.action}</small>
            </article>
          ))
        )}
      </div>
    </div>
  );
}

function LessonScreen({
  lesson,
  onBack,
  onComplete,
}: {
  lesson: Lesson;
  onBack: () => void;
  onComplete: (lesson: Lesson, reflection: string, action: string) => void;
}) {
  const skill = getSkill(lesson.skillId);
  const Icon = skillIconMap[skill.id];
  const [step, setStep] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [reflection, setReflection] = useState("");
  const [action, setAction] = useState("");
  const canFinish = reflection.trim().length > 1 && action.trim().length > 1;

  return (
    <main className="lessonShell" style={{ "--accent": skill.color, "--tint": skill.tint } as React.CSSProperties}>
      <section className="lessonPanel" aria-labelledby="lesson-title">
        <header className="lessonHeader">
          <button className="iconButton" type="button" onClick={onBack} title="Назад" aria-label="Назад">
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <div className="lessonProgress" aria-label={`Шаг ${step + 1} из 4`}>
            {[0, 1, 2, 3].map((item) => (
              <span key={item} className={item <= step ? "isDone" : ""} />
            ))}
          </div>
        </header>

        {step === 0 && (
          <div className="lessonStep">
            <div className="lessonBadge">
              <Icon size={28} aria-hidden="true" />
            </div>
            <p className="eyebrow">
              {skill.name} · {lesson.duration}
            </p>
            <h1 id="lesson-title">{lesson.title}</h1>
            <p className="leadText">{lesson.concept}</p>
            <div className="exampleBox">
              <MessageCircle size={20} aria-hidden="true" />
              <span>{lesson.example}</span>
            </div>
            <button className="primaryButton" type="button" onClick={() => setStep(1)}>
              <span>К упражнению</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {step === 1 && (
          <div className="lessonStep">
            <p className="eyebrow">Упражнение</p>
            <h1>{lesson.exercise.prompt}</h1>
            <div className="choiceList">
              {lesson.exercise.choices.map((choice, index) => (
                <button
                  className={`${selectedChoice === index ? "isPicked" : ""} ${choice.supportive ? "isSupportive" : ""}`}
                  key={choice.text}
                  type="button"
                  onClick={() => setSelectedChoice(index)}
                >
                  {choice.text}
                </button>
              ))}
            </div>
            {selectedChoice !== null && (
              <div className="feedbackBox">
                <CheckCircle2 size={20} aria-hidden="true" />
                <span>{lesson.exercise.choices[selectedChoice].feedback}</span>
              </div>
            )}
            <div className="buttonRow">
              <button className="secondaryButton" type="button" onClick={() => setStep(0)}>
                <ChevronLeft size={18} aria-hidden="true" />
                <span>Назад</span>
              </button>
              <button className="primaryButton" type="button" disabled={selectedChoice === null} onClick={() => setStep(2)}>
                <span>Дальше</span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="lessonStep">
            <p className="eyebrow">Микрорефлексия</p>
            <h1>{lesson.reflectionPrompt}</h1>
            <textarea
              value={reflection}
              onChange={(event) => setReflection(event.target.value)}
              placeholder="Коротко, в одну-две фразы"
              rows={5}
            />
            <button className="primaryButton" type="button" disabled={reflection.trim().length < 2} onClick={() => setStep(3)}>
              <span>К действию</span>
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="lessonStep">
            <p className="eyebrow">Маленькое действие</p>
            <h1>{lesson.actionPrompt}</h1>
            <textarea
              value={action}
              onChange={(event) => setAction(event.target.value)}
              placeholder="Например: сделаю паузу на 2 минуты после встречи"
              rows={5}
            />
            <button className="primaryButton" type="button" disabled={!canFinish} onClick={() => onComplete(lesson, reflection, action)}>
              <span>Завершить практику</span>
              <CheckCircle2 size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;
