import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  ...authTables,
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    userType: v.optional(v.union(v.literal("user"), v.literal("admin"), v.literal("blocked"))),
    plan: v.optional(v.union(v.literal("free"), v.literal("pro"), v.literal("excellence"))),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    nationalId: v.optional(v.string()),
    careers: v.optional(v.array(v.string())),
    subjectSelectionModalSeen: v.optional(v.boolean()),
    selectedSubjectCodes: v.optional(v.array(v.string())),
    subjectSelectionPeriodStart: v.optional(v.number()),
    subjectSelectionPeriodEnd: v.optional(v.number()),
    subjectSelectionEditsRemaining: v.optional(v.number()),
    subjectSelectionUpdatedAt: v.optional(v.number()),
    proMaterialPeriodStart: v.optional(v.number()),
    proMaterialPeriodEnd: v.optional(v.number()),
    proMaterialUses: v.optional(v.array(v.string())),
    toolUsePeriodStart: v.optional(v.number()),
    toolUsePeriodEnd: v.optional(v.number()),
    toolUses: v.optional(v.array(v.string())),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),
  appUsers: defineTable({
    email: v.string(),
    userType: v.union(v.literal("user"), v.literal("admin"), v.literal("blocked")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),
  documents: defineTable({
    title: v.string(),
    searchTitle: v.optional(v.string()),
    subject: v.optional(v.string()),
    subjects: v.optional(v.array(v.string())),
    format: v.string(),
    level: v.string(),
    source: v.optional(v.string()),
    externalUrl: v.optional(v.string()),
    storageBucket: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    imageStorageBucket: v.optional(v.string()),
    imageStoragePath: v.optional(v.string()),
    imageFileName: v.optional(v.string()),
    fileName: v.optional(v.string()),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    viewCount: v.optional(v.number()),
    ratingAverage: v.optional(v.number()),
    ratingCount: v.optional(v.number()),
    saved: v.boolean(),
    ownerId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_created", ["createdAt"])
    .index("by_view_count", ["viewCount", "createdAt"])
    .index("by_format_created", ["format", "createdAt"])
    .index("by_level_created", ["level", "createdAt"])
    .index("by_format_level_created", ["format", "level", "createdAt"])
    .index("by_format_view_count", ["format", "viewCount", "createdAt"])
    .index("by_level_view_count", ["level", "viewCount", "createdAt"])
    .index("by_format_level_view_count", ["format", "level", "viewCount", "createdAt"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["ownerId", "format", "level"],
    })
    .searchIndex("search_normalized_title", {
      searchField: "searchTitle",
      filterFields: ["format", "level"],
    }),
  libraryStates: defineTable({
    key: v.string(),
    revision: v.number(),
    updatedAt: v.number(),
    statsReady: v.optional(v.boolean()),
    searchIndexReady: v.optional(v.boolean()),
  }).index("by_key", ["key"]),
  libraryStats: defineTable({
    key: v.string(),
    total: v.number(),
    formats: v.any(),
    levels: v.any(),
    subjects: v.any(),
    formatLevels: v.any(),
    subjectDetails: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
  libraryChanges: defineTable({
    key: v.string(),
    revision: v.number(),
    operation: v.union(v.literal("create"), v.literal("update"), v.literal("delete")),
    documentId: v.id("documents"),
    before: v.optional(v.any()),
    after: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_key_revision", ["key", "revision"])
    .index("by_document", ["documentId"]),
  documentFavorites: defineTable({
    userEmail: v.string(),
    documentId: v.id("documents"),
    createdAt: v.number(),
  })
    .index("by_user", ["userEmail"])
    .index("by_document", ["documentId"])
    .index("by_user_document", ["userEmail", "documentId"]),
  documentRatings: defineTable({
    userEmail: v.string(),
    documentId: v.id("documents"),
    rating: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_document", ["documentId"])
    .index("by_user_document", ["userEmail", "documentId"]),
  flowStatuses: defineTable({
    userEmail: v.string(),
    career: v.string(),
    courseCode: v.string(),
    status: v.string(),
    updatedAt: v.number(),
  })
    .index("by_user_career", ["userEmail", "career"])
    .index("by_user_career_course", ["userEmail", "career", "courseCode"]),
  comments: defineTable({
    body: v.string(),
    userEmail: v.string(),
    authorName: v.optional(v.string()),
    parentId: v.optional(v.id("comments")),
    likeCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_parent", ["parentId"])
    .index("by_created", ["createdAt"]),
  commentLikes: defineTable({
    commentId: v.id("comments"),
    userEmail: v.string(),
    createdAt: v.number(),
  })
    .index("by_comment", ["commentId"])
    .index("by_user_comment", ["userEmail", "commentId"]),
  commentReports: defineTable({
    commentId: v.id("comments"),
    reporterEmail: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("dismissed"), v.literal("deleted")),
    resolverEmail: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_comment", ["commentId"])
    .index("by_reporter_comment", ["reporterEmail", "commentId"]),
  paymentRequests: defineTable({
    userEmail: v.string(),
    userName: v.optional(v.string()),
    plan: v.union(v.literal("pro"), v.literal("excellence")),
    billingPeriod: v.union(v.literal("monthly"), v.literal("quarterly")),
    amountUsd: v.number(),
    bcvRate: v.optional(v.number()),
    amountBs: v.number(),
    payerPhone: v.string(),
    bankCode: v.string(),
    bankName: v.string(),
    referenceLast4: v.string(),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    adminEmail: v.optional(v.string()),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_status_created", ["status", "createdAt"])
    .index("by_user_created", ["userEmail", "createdAt"]),
});
