-- CreateEnum
CREATE TYPE "LLMPlatform" AS ENUM ('ANTHROPIC', 'GPT');

-- CreateEnum
CREATE TYPE "UserPlatform" AS ENUM ('API', 'TELEGRAM');

-- CreateTable
CREATE TABLE "AgentLlmMessageModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "is_agent_message" BOOLEAN NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "AgentLlmMessageModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "core" VARCHAR(256) NOT NULL,

    CONSTRAINT "AgentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentUserMemoryModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "memories" TEXT[],

    CONSTRAINT "AgentUserMemoryModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmApiModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "platform" "LLMPlatform" NOT NULL,
    "model" VARCHAR(256) NOT NULL,

    CONSTRAINT "LlmApiModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmApiKeyModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_model_id" INTEGER,
    "platform" "LLMPlatform" NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "LlmApiKeyModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "core" TEXT NOT NULL,
    "owner_agent_id" INTEGER NOT NULL,
    "owner_user_id" INTEGER NOT NULL,

    CONSTRAINT "LocationModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageModel" (
    "id" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "location_id" INTEGER,
    "sender_agent_id" INTEGER,
    "sender_user_id" INTEGER,
    "receiver_agent_id" INTEGER,
    "receiver_user_id" INTEGER,
    "content" TEXT NOT NULL,
    "innerThought" TEXT,
    "emotion" TEXT,

    CONSTRAINT "MessageModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiKeyModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_model_id" INTEGER,
    "key" TEXT NOT NULL,

    CONSTRAINT "UserApiKeyModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApiHistoryModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "user_model_id" INTEGER,
    "request" JSONB NOT NULL,
    "response" JSONB NOT NULL,

    CONSTRAINT "UserApiHistoryModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserModel" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "platform" "UserPlatform" NOT NULL,
    "pid" BIGINT NOT NULL,
    "username" TEXT,
    "nickname" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,

    CONSTRAINT "UserModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AgentModelToLlmApiModel" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_AgentModelToLlmApiModel_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "AgentLlmMessageModel_agent_id_location_id_created_at_idx" ON "AgentLlmMessageModel"("agent_id", "location_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "AgentUserMemoryModel_agent_id_user_id_key" ON "AgentUserMemoryModel"("agent_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "LlmApiKeyModel_user_model_id_platform_key" ON "LlmApiKeyModel"("user_model_id", "platform");

-- CreateIndex
CREATE INDEX "MessageModel_location_id_created_at_idx" ON "MessageModel"("location_id", "created_at");

-- CreateIndex
CREATE INDEX "MessageModel_sender_agent_id_created_at_idx" ON "MessageModel"("sender_agent_id", "created_at");

-- CreateIndex
CREATE INDEX "MessageModel_sender_user_id_created_at_idx" ON "MessageModel"("sender_user_id", "created_at");

-- CreateIndex
CREATE INDEX "MessageModel_receiver_agent_id_created_at_idx" ON "MessageModel"("receiver_agent_id", "created_at");

-- CreateIndex
CREATE INDEX "MessageModel_receiver_user_id_created_at_idx" ON "MessageModel"("receiver_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "UserApiKeyModel_user_model_id_key" ON "UserApiKeyModel"("user_model_id");

-- CreateIndex
CREATE INDEX "UserApiHistoryModel_user_model_id_created_at_idx" ON "UserApiHistoryModel"("user_model_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "UserModel_pid_key" ON "UserModel"("pid");

-- CreateIndex
CREATE INDEX "_AgentModelToLlmApiModel_B_index" ON "_AgentModelToLlmApiModel"("B");

-- AddForeignKey
ALTER TABLE "AgentLlmMessageModel" ADD CONSTRAINT "AgentLlmMessageModel_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "AgentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLlmMessageModel" ADD CONSTRAINT "AgentLlmMessageModel_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "LocationModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUserMemoryModel" ADD CONSTRAINT "AgentUserMemoryModel_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "AgentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentUserMemoryModel" ADD CONSTRAINT "AgentUserMemoryModel_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "UserModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmApiKeyModel" ADD CONSTRAINT "LlmApiKeyModel_user_model_id_fkey" FOREIGN KEY ("user_model_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationModel" ADD CONSTRAINT "LocationModel_owner_agent_id_fkey" FOREIGN KEY ("owner_agent_id") REFERENCES "AgentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationModel" ADD CONSTRAINT "LocationModel_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "UserModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModel" ADD CONSTRAINT "MessageModel_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "LocationModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModel" ADD CONSTRAINT "MessageModel_sender_agent_id_fkey" FOREIGN KEY ("sender_agent_id") REFERENCES "AgentModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModel" ADD CONSTRAINT "MessageModel_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModel" ADD CONSTRAINT "MessageModel_receiver_agent_id_fkey" FOREIGN KEY ("receiver_agent_id") REFERENCES "AgentModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageModel" ADD CONSTRAINT "MessageModel_receiver_user_id_fkey" FOREIGN KEY ("receiver_user_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiKeyModel" ADD CONSTRAINT "UserApiKeyModel_user_model_id_fkey" FOREIGN KEY ("user_model_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApiHistoryModel" ADD CONSTRAINT "UserApiHistoryModel_user_model_id_fkey" FOREIGN KEY ("user_model_id") REFERENCES "UserModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentModelToLlmApiModel" ADD CONSTRAINT "_AgentModelToLlmApiModel_A_fkey" FOREIGN KEY ("A") REFERENCES "AgentModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AgentModelToLlmApiModel" ADD CONSTRAINT "_AgentModelToLlmApiModel_B_fkey" FOREIGN KEY ("B") REFERENCES "LlmApiModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
