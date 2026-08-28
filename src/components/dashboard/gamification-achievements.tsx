"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Trophy,
  Flame,
  Target,
  Star,
  Award,
  Zap,
  Clock,
  Gift,
  Lock,
  Check,
} from "lucide-react";

interface Badge {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  earned: boolean;
  earnedAt?: string;
  progress?: number;
  maxProgress?: number;
}

interface Streak {
  type: "daily" | "weekly" | "monthly";
  current: number;
  best: number;
  lastActivity: string;
  isActive: boolean;
}

interface Challenge {
  id: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr: string;
  reward: number;
  rewardType: "credits" | "tokens" | "badge";
  progress: number;
  maxProgress: number;
  expiresAt: string;
  completed: boolean;
}

interface Achievement {
  id: string;
  name: string;
  nameAr: string;
  level: number;
  maxLevel: number;
  xp: number;
  xpToNextLevel: number;
  title: string;
  titleAr: string;
}

interface GamificationData {
  badges: Badge[];
  streaks: Streak[];
  challenges: Challenge[];
  achievement: Achievement;
  totalXP: number;
  level: number;
  pointsThisMonth: number;
}

const STREAK_ICONS: Record<string, React.ElementType> = {
  daily: Flame,
  weekly: Target,
  monthly: Trophy,
};

const REWARD_ICONS: Record<string, React.ElementType> = {
  credits: Zap,
  tokens: Star,
  badge: Award,
};

export function GamificationCard() {
  const [data, setData] = useState<GamificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<
    "badges" | "streaks" | "challenges" | "level"
  >("badges");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch("/api/worker/gamification");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error("Error fetching gamification data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="h-32 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const earnedBadges = data.badges.filter((b) => b.earned);
  const availableBadges = data.badges.filter((b) => !b.earned);
  const activeChallenges = data.challenges.filter((c) => !c.completed);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-600 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            <span className="font-medium">Achievements & Rewards</span>
          </div>
          <span className="text-sm opacity-80">الإنجازات والمكافآت</span>
        </div>
      </div>

      {/* Level Progress */}
      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="text-sm text-amber-700">
              Level {data.level} — {data.achievement.title}
            </div>
            <div className="text-xs text-amber-600">
              {data.achievement.titleAr}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-amber-700">
              {data.totalXP.toLocaleString()} XP
            </div>
            <div className="text-xs text-amber-600">
              {data.pointsThisMonth} this month
            </div>
          </div>
        </div>
        <div className="h-3 bg-amber-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
            style={{
              width: `${
                (data.achievement.xp /
                  (data.achievement.xp + data.achievement.xpToNextLevel)) *
                100
              }%`,
            }}
          />
        </div>
        <div className="flex justify-between text-xs text-amber-600 mt-1">
          <span>
            {data.achievement.xp} /{" "}
            {data.achievement.xp + data.achievement.xpToNextLevel} XP
          </span>
          <span>
            {data.achievement.xpToNextLevel} XP to Level {data.level + 1}
          </span>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex overflow-x-auto">
          {[
            { id: "badges" as const, label: "Badges", icon: Award },
            { id: "streaks" as const, label: "Streaks", icon: Flame },
            { id: "challenges" as const, label: "Challenges", icon: Target },
            { id: "level" as const, label: "Level Up", icon: Star },
          ].map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                  activeSection === section.id
                    ? "border-amber-500 text-amber-600 bg-amber-50"
                    : "border-transparent text-gray-600 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{section.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4">
        {/* Badges */}
        {activeSection === "badges" && (
          <div className="space-y-4">
            {/* Earned Badges */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">
                Earned ({earnedBadges.length})
              </h4>
              <div className="grid grid-cols-2 gap-3">
                {earnedBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center"
                  >
                    <div className="text-3xl mb-2">{badge.icon}</div>
                    <div className="font-medium text-sm">{badge.name}</div>
                    <div className="text-xs text-gray-500">{badge.nameAr}</div>
                    <div className="text-xs text-amber-600 mt-1">
                      Earned {badge.earnedAt}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Available Badges */}
            <div>
              <h4 className="font-medium text-gray-900 mb-3">
                In Progress ({availableBadges.length})
              </h4>
              <div className="space-y-2">
                {availableBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl opacity-50">{badge.icon}</div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{badge.name}</div>
                        <div className="text-xs text-gray-500">
                          {badge.description}
                        </div>
                        <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{
                              width: `${
                                ((badge.progress || 0) /
                                  (badge.maxProgress || 1)) *
                                100
                              }%`,
                            }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {badge.progress}/{badge.maxProgress}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Streaks */}
        {activeSection === "streaks" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Activity Streaks
            </h4>
            <div className="space-y-3">
              {data.streaks.map((streak) => {
                const Icon = STREAK_ICONS[streak.type];
                return (
                  <div
                    key={streak.type}
                    className={cn(
                      "p-4 rounded-lg border-2",
                      streak.isActive
                        ? "border-amber-500 bg-amber-50"
                        : "border-gray-200"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Icon
                          className={cn(
                            "w-6 h-6",
                            streak.isActive
                              ? "text-amber-500"
                              : "text-gray-400"
                          )}
                        />
                        <div>
                          <div className="font-medium capitalize">
                            {streak.type} Streak
                          </div>
                          <div className="text-xs text-gray-500">
                            {streak.type === "daily"
                              ? "يومي"
                              : streak.type === "weekly"
                              ? "أسبوعي"
                              : "شهري"}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-3xl font-bold text-amber-600">
                          {streak.current}
                        </div>
                        <div className="text-xs text-gray-500">
                          Best: {streak.best}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {streak.isActive ? (
                        <Flame className="w-4 h-4 text-orange-500" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-400" />
                      )}
                      <span className="text-gray-600">
                        {streak.isActive ? "Active" : "Streak ended"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Challenges */}
        {activeSection === "challenges" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Active Challenges
            </h4>
            <div className="space-y-3">
              {activeChallenges.map((challenge) => {
                const RewardIcon = REWARD_ICONS[challenge.rewardType];
                const daysLeft = Math.ceil(
                  (new Date(challenge.expiresAt).getTime() - Date.now()) /
                    86400000
                );
                return (
                  <div
                    key={challenge.id}
                    className="p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-medium">{challenge.name}</div>
                        <div className="text-sm text-gray-500">
                          {challenge.nameAr}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded">
                        <RewardIcon className="w-4 h-4" />
                        +{challenge.reward}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {challenge.description}
                    </p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Progress</span>
                      <span className="text-sm font-medium">
                        {challenge.progress}/{challenge.maxProgress}
                      </span>
                    </div>
                    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          challenge.completed
                            ? "bg-green-500"
                            : "bg-amber-500"
                        )}
                        style={{
                          width: `${
                            (challenge.progress / challenge.maxProgress) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                      <span>
                        {challenge.completed ? "Completed!" : `${daysLeft} days left`}
                      </span>
                      {challenge.completed && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Level Up */}
        {activeSection === "level" && (
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">
              Level Progress
            </h4>

            {/* Current Level */}
            <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg text-white text-center">
              <div className="text-sm opacity-80">Current Level</div>
              <div className="text-5xl font-bold">{data.level}</div>
              <div className="text-lg">{data.achievement.title}</div>
              <div className="text-sm opacity-80">
                {data.achievement.titleAr}
              </div>
            </div>

            {/* XP Progress */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  Experience Points
                </span>
                <span className="font-medium">
                  {data.totalXP.toLocaleString()} XP
                </span>
              </div>
              <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                  style={{
                    width: `${
                      (data.achievement.xp /
                        (data.achievement.xp + data.achievement.xpToNextLevel)) *
                      100
                    }%`,
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Level {data.level}</span>
                <span>
                  {data.achievement.xpToNextLevel} XP to Level {data.level + 1}
                </span>
                <span>Level {data.level + 1}</span>
              </div>
            </div>

            {/* Level Benefits */}
            <div className="p-4 border border-amber-200 rounded-lg">
              <h5 className="font-medium text-gray-900 mb-3">
                Level {data.level + 1} Benefits
              </h5>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500" />
                  <span>5% bonus on all credit purchases</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500" />
                  <span>Priority customer support</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500" />
                  <span>Exclusive "Expert" badge on profile</span>
                </li>
              </ul>
            </div>

            {/* How to Earn XP */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <h5 className="font-medium text-blue-900 mb-2">
                How to Earn XP
              </h5>
              <div className="space-y-2 text-sm text-blue-800">
                <div className="flex items-center justify-between">
                  <span>Complete a booking</span>
                  <span className="font-medium">+50 XP</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Get a 5-star review</span>
                  <span className="font-medium">+25 XP</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Maintain daily streak</span>
                  <span className="font-medium">+10 XP/day</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Complete a challenge</span>
                  <span className="font-medium">+100 XP</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
