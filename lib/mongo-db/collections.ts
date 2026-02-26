/**
 * MongoDB collection names for benchmark study/survey data.
 * Uses case_ prefix to avoid conflicts with better-auth collections.
 */
export const MONGO_COLLECTIONS = {
  users: "case_participant_users",
  studies: "case_studies",
  surveys: "case_surveys",
  participants: "case_participants",
  responses: "case_responses",
} as const;
