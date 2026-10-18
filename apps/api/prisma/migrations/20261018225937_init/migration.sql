-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ativo', 'afastado', 'desligado');

-- CreateEnum
CREATE TYPE "RiskType" AS ENUM ('fisico', 'quimico', 'biologico', 'ergonomico', 'acidente', 'psicossocial');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('admissional', 'periodico', 'retorno_trabalho', 'mudanca_risco', 'monitoracao_pontual', 'demissional');

-- CreateEnum
CREATE TYPE "ExamResult" AS ENUM ('apto', 'inapto');

-- CreateEnum
CREATE TYPE "AccidentType" AS ENUM ('tipico', 'trajeto', 'doenca', 'incidente', 'quase_acidente');

-- CreateEnum
CREATE TYPE "AccidentStatus" AS ENUM ('registrado', 'em_investigacao', 'concluido');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('aberta', 'em_andamento', 'aguardando_aprovacao', 'concluida', 'cancelada');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('baixa', 'media', 'alta', 'critica');

-- CreateEnum
CREATE TYPE "Recurrence" AS ENUM ('nenhuma', 'diaria', 'semanal', 'mensal', 'trimestral', 'semestral', 'anual');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PGR', 'PCMSO', 'LTCAT', 'PPP', 'ORDEM_SERVICO', 'FICHA_EPI', 'PROCEDIMENTO', 'LAUDO', 'LICENCA_AMBIENTAL', 'CERTIFICADO', 'OUTRO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('rascunho', 'em_revisao', 'aprovado', 'obsoleto');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('rascunho', 'em_revisao', 'aprovada', 'reprovada');

-- CreateEnum
CREATE TYPE "EsocialEventType" AS ENUM ('S2210', 'S2220', 'S2240');

-- CreateEnum
CREATE TYPE "EsocialStatus" AS ENUM ('rascunho', 'com_pendencias', 'validado', 'exportado', 'na_fila', 'enviado', 'processado', 'rejeitado', 'erro_transmissao', 'recibo_manual');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "mfaPending" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "companyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unitIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tradeName" TEXT,
    "cnpj" TEXT NOT NULL,
    "cnae" TEXT,
    "riskDegree" INTEGER,
    "address" TEXT,
    "city" TEXT,
    "uf" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inscriptionType" INTEGER,
    "inscriptionNumber" TEXT,
    "address" TEXT,
    "city" TEXT,
    "uf" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environmentDescription" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRole" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cbo" TEXT,
    "description" TEXT,
    "activities" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sectorId" TEXT,
    "jobRoleId" TEXT,
    "name" TEXT NOT NULL,
    "cpf" TEXT NOT NULL,
    "birthDate" DATE,
    "gender" TEXT,
    "registration" TEXT,
    "categoryCode" TEXT,
    "function" TEXT,
    "admissionDate" DATE,
    "terminationDate" DATE,
    "status" "WorkerStatus" NOT NULL DEFAULT 'ativo',
    "email" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Risk" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectorId" TEXT NOT NULL,
    "type" "RiskType" NOT NULL,
    "hazard" TEXT NOT NULL,
    "description" TEXT,
    "source" TEXT,
    "agentCode" TEXT,
    "intensity" TEXT,
    "unit" TEXT,
    "technique" TEXT,
    "probability" INTEGER NOT NULL,
    "severity" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "controls" TEXT,
    "epcEfficient" BOOLEAN,
    "epiEfficient" BOOLEAN,
    "epiCas" TEXT,
    "assessedAt" DATE,
    "assessedBy" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Risk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "examDate" DATE NOT NULL,
    "result" "ExamResult",
    "physicianName" TEXT,
    "physicianCrm" TEXT,
    "physicianUf" TEXT,
    "pcmsoResponsibleName" TEXT,
    "pcmsoResponsibleCrm" TEXT,
    "pcmsoResponsibleUf" TEXT,
    "proceduresEnc" TEXT,
    "notesEnc" TEXT,
    "nextDueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Accident" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "workerId" TEXT,
    "type" "AccidentType" NOT NULL,
    "status" "AccidentStatus" NOT NULL DEFAULT 'registrado',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "hoursWorked" TEXT,
    "description" TEXT NOT NULL,
    "location" TEXT,
    "bodyPartCode" TEXT,
    "laterality" TEXT,
    "causingAgentCode" TEXT,
    "situationCode" TEXT,
    "injuryNatureCode" TEXT,
    "death" BOOLEAN NOT NULL DEFAULT false,
    "deathDate" DATE,
    "policeReport" BOOLEAN NOT NULL DEFAULT false,
    "hospitalized" BOOLEAN NOT NULL DEFAULT false,
    "medicalLeave" BOOLEAN NOT NULL DEFAULT false,
    "medicalEnc" TEXT,
    "rootCause" TEXT,
    "investigation" TEXT,
    "witnesses" TEXT,
    "catNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Accident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ppe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ca" TEXT,
    "caValidUntil" DATE,
    "replaceDays" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ppe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PpeDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "ppeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "deliveredAt" DATE NOT NULL,
    "replaceBy" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PpeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reference" TEXT,
    "workloadHours" INTEGER,
    "validityMonths" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "completedAt" DATE NOT NULL,
    "validUntil" DATE,
    "instructor" TEXT,
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "unitId" TEXT,
    "title" TEXT NOT NULL,
    "objective" TEXT,
    "ownerId" TEXT,
    "origin" TEXT,
    "status" TEXT NOT NULL DEFAULT 'aberto',
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT,
    "unitId" TEXT,
    "actionPlanId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'media',
    "status" "TaskStatus" NOT NULL DEFAULT 'aberta',
    "dueDate" DATE,
    "recurrence" "Recurrence" NOT NULL DEFAULT 'nenhuma',
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approverId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rejectionReason" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "originId" TEXT,
    "completedAt" TIMESTAMP(3),
    "previousTaskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "unitId" TEXT,
    "type" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'rascunho',
    "responsibleId" TEXT,
    "technicalResponsible" TEXT,
    "technicalRegistry" TEXT,
    "validFrom" DATE,
    "validUntil" DATE,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'rascunho',
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "changeNotes" TEXT,
    "uploadedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approverRegistry" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "frequency" TEXT NOT NULL,
    "recipientIds" TEXT[],
    "createdById" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsocialTableEntry" (
    "id" TEXT NOT NULL,
    "table" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "validFrom" TEXT,
    "validUntil" TEXT,

    CONSTRAINT "EsocialTableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsocialEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workerId" TEXT,
    "type" "EsocialEventType" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "EsocialStatus" NOT NULL DEFAULT 'rascunho',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "isRetification" BOOLEAN NOT NULL DEFAULT false,
    "originalEventId" TEXT,
    "receiptNumber" TEXT,
    "protocolNumber" TEXT,
    "receiptSource" TEXT,
    "receiptAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsocialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsocialEventVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payloadEnc" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "leiauteVersion" TEXT,
    "xmlEnc" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsocialEventVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsocialSubmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "protocolNumber" TEXT,
    "receiptNumber" TEXT,
    "responseCode" TEXT,
    "responseMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "EsocialSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EsocialLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsocialLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_key_key" ON "Role"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_cnpj_key" ON "Company"("tenantId", "cnpj");

-- CreateIndex
CREATE INDEX "Unit_tenantId_companyId_idx" ON "Unit"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Sector_tenantId_unitId_idx" ON "Sector"("tenantId", "unitId");

-- CreateIndex
CREATE INDEX "JobRole_tenantId_companyId_idx" ON "JobRole"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Worker_tenantId_unitId_idx" ON "Worker"("tenantId", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_tenantId_companyId_cpf_key" ON "Worker"("tenantId", "companyId", "cpf");

-- CreateIndex
CREATE INDEX "Risk_tenantId_sectorId_idx" ON "Risk"("tenantId", "sectorId");

-- CreateIndex
CREATE INDEX "Exam_tenantId_workerId_idx" ON "Exam"("tenantId", "workerId");

-- CreateIndex
CREATE INDEX "Exam_tenantId_nextDueDate_idx" ON "Exam"("tenantId", "nextDueDate");

-- CreateIndex
CREATE INDEX "Accident_tenantId_occurredAt_idx" ON "Accident"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "PpeDelivery_tenantId_workerId_idx" ON "PpeDelivery"("tenantId", "workerId");

-- CreateIndex
CREATE INDEX "TrainingRecord_tenantId_validUntil_idx" ON "TrainingRecord"("tenantId", "validUntil");

-- CreateIndex
CREATE INDEX "ActionPlan_tenantId_idx" ON "ActionPlan"("tenantId");

-- CreateIndex
CREATE INDEX "Task_tenantId_status_idx" ON "Task"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Task_tenantId_assigneeId_idx" ON "Task"("tenantId", "assigneeId");

-- CreateIndex
CREATE INDEX "Task_tenantId_dueDate_idx" ON "Task"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "Attachment_tenantId_entity_entityId_idx" ON "Attachment"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "Document_tenantId_companyId_idx" ON "Document"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "Document_tenantId_validUntil_idx" ON "Document"("tenantId", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ReportSchedule_tenantId_idx" ON "ReportSchedule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EsocialTableEntry_table_code_key" ON "EsocialTableEntry"("table", "code");

-- CreateIndex
CREATE INDEX "EsocialEvent_tenantId_type_status_idx" ON "EsocialEvent"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "EsocialEvent_tenantId_sourceType_sourceId_idx" ON "EsocialEvent"("tenantId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EsocialEventVersion_eventId_version_key" ON "EsocialEventVersion"("eventId", "version");

-- CreateIndex
CREATE INDEX "EsocialLog_eventId_idx" ON "EsocialLog"("eventId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sector" ADD CONSTRAINT "Sector_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRole" ADD CONSTRAINT "JobRole_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Risk" ADD CONSTRAINT "Risk_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Accident" ADD CONSTRAINT "Accident_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeDelivery" ADD CONSTRAINT "PpeDelivery_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeDelivery" ADD CONSTRAINT "PpeDelivery_ppeId_fkey" FOREIGN KEY ("ppeId") REFERENCES "Ppe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_actionPlanId_fkey" FOREIGN KEY ("actionPlanId") REFERENCES "ActionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsocialEventVersion" ADD CONSTRAINT "EsocialEventVersion_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EsocialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsocialSubmission" ADD CONSTRAINT "EsocialSubmission_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EsocialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EsocialLog" ADD CONSTRAINT "EsocialLog_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "EsocialEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
