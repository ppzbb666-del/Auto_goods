import { useEffect, useState, type SetStateAction } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import type { AutomationDryRunStartInput, AutomationFullFlowJob, AutomationManualStepBudgetTrialProposal, AutomationManualStepBudgetTrialRequestResult, AutomationPreflightReport, AutomationQueueDaemonHealth, AutomationQueueDaemonState, AutomationQueueRunStartResult, AutomationRecoveryRun, AutomationTaskFileExportResult, AutomationTaskSnapshotDiffResult, AutomationUnattendedStartupCheck, DianxiaomiListingRequirementRules, DianxiaomiProductWorkItem, DianxiaomiSelectorConfig, DraftUpdateInput, ManualProductInput, PricingRules, ProductUpdateInput, PublishCheckResult, PublishTask, SelectorCalibrationJob, SelectorConfigChangeRisk, SelectorConfigDiffResult, SelectorWorkbench } from "@temu-ai-ops/shared"
import {
  archiveStaleProfileLocks,
  createAutomationLaunchPreset,
  createManualProductTask,
  createTaskFromDianxiaomiCollectedProduct,
  createTaskFromDianxiaomiProductWorkItem,
  csvTemplateUrl,
  deleteAutomationLaunchPreset,
  exportAutomationTaskFile,
  fetchAutomationDryRunJobLog,
  fetchAutomationDryRunJobs,
  fetchAutomationFillDraftJobLog,
  fetchAutomationFillDraftJobs,
  fetchAutomationFullFlowJobs,
  fetchAutomationLaunchPresets,
  fetchAutomationQueueRuns,
  fetchAutomationRecoveryRuns,
  fetchAutomationSaveDraftJobLog,
  fetchAutomationSaveDraftJobs,
  fetchAutomationSubmitListingJobLog,
  fetchAutomationSubmitListingJobs,
  fetchAutomationTaskFileExportDiff,
  fetchAutomationTaskFileExports,
  fetchDianxiaomiCollectedProducts,
  fetchDianxiaomiRequirementRules,
  fetchDianxiaomiProductWorkItems,
  fetchAutomationPreflight,
  fetchAutomationQueueDaemon,
  fetchAutomationQueueDaemonHealth,
  fetchAutomationReadiness,
  fetchAutomationReports,
  fetchActiveTask,
  fetchAutomationUnattendedStartupCheck,
  fetchProfileLockArchiveReadiness,
  fetchManualBudgetTrials,
  fetchPublishCheck,
  fetchPublishChecks,
  fetchPricingRules,
  fetchSelectorDiagnoses,
  fetchSelectorCalibrationJobLog,
  fetchSelectorCalibrationJobs,
  fetchSelectorConfig,
  fetchSelectorConfigVersions,
  fetchSelectorConfigValidation,
  fetchSelectorWorkbench,
  fetchTasks,
  generateSelectorConfig,
  importCsvProducts,
  importExcelProducts,
  planTask,
  syncActiveTask,
  startAutomationDryRun,
  startAutomationFillDraft,
  startAutomationFullFlow,
  startAutomationQueueRun,
  startAutomationRecoveryRun,
  startManualBudgetTrial,
  startNextManualBudgetValidationRun,
  startAutomationQueueDaemon,
  startAutomationSaveDraft,
  startAutomationSubmitListing,
  pauseAutomationQueueDaemon,
  retryDianxiaomiProductWorkItemAfterFix,
  startSelectorCalibration,
  tickAutomationQueueDaemon,
  restoreTaskDraftVersion,
  restoreSelectorConfigVersionWithInput,
  reviewTask,
  reviewTasks,
  restoreLatestAiDraftVersions,
  saveSelectorConfig,
  updatePricingRules,
  updateDianxiaomiRequirementRules,
  updateAutomationLaunchPreset,
  updateTaskDraft,
  updateTaskProduct
} from "./api"
import { useDashboardStore } from "./store"
import {
  AutomationPreflightCard,
  AutomationRunConfirmation,
  DailyMetric,
  DailyWorkItemList,
  DryRunJobCard,
  FillDraftJobCard,
  FullFlowJobCard,
  ImportResult,
  InfoBlock,
  QueueDaemonCard,
  QueueDaemonHealthCard,
  QueueRunCard,
  RecoveryRunCard,
  SaveDraftJobCard,
  SelectorCalibrationJobCard,
  SelectorConfigDiffPreview,
  SelectorWorkbenchCard,
  SubmitListingJobCard,
  SummaryCard,
  TargetSurfaceSummary,
  TaskSnapshotDiffPreview,
  UnattendedStartupCheckCard
} from "./components"
import { buildSelectorConfigDiffPreview, cloneSelectorConfig, createSelectorConfigDraft, selectorDiffChangeCount } from "./lib/selector-config"
import {
  asRecord,
  automationDraftFromInput,
  createAutomationStartInput,
  createDianxiaomiRequirementRulesDraft,
  createListingEditDraft,
  createProductEditDraft,
  csvExample,
  defaultAutomationLaunchDraft,
  defaultDailyMediaAutomationTools,
  defaultManualProduct,
  formatAttributeText,
  formatLines,
  formatLogisticsTiersText,
  formatMoney,
  getErrorMessage,
  getTaskProgress,
  parseAttributeText,
  parseImagesText,
  parseLines,
  parseLogisticsTiersText,
  parseSkusText,
  reviewDecisionLabel,
  reviewStatusLabel,
  statusLabel,
  taskFileLaunchClass,
  type AutomationLaunchDraft,
  type DailyAlert,
  type ListingEditDraft,
  type ProductEditDraft
} from "./lib/dashboard-helpers"
import { useDailyDashboard } from "./lib/use-daily-dashboard"

export function App() {
  const { tasks, setTasks, activeTaskId, setActiveTaskId } = useDashboardStore()
  const [csvText, setCsvText] = useState(csvExample)
  const [selectedExcelFile, setSelectedExcelFile] = useState<File | null>(null)
  const [pricingDraft, setPricingDraft] = useState<PricingRules | null>(null)
  const [logisticsTiersText, setLogisticsTiersText] = useState("")
  const [dianxiaomiRequirementRulesDraft, setDianxiaomiRequirementRulesDraft] = useState<DianxiaomiListingRequirementRules | null>(null)
  const [dianxiaomiRecommendedKeysText, setDianxiaomiRecommendedKeysText] = useState("")
  const [dianxiaomiBlockedTermsText, setDianxiaomiBlockedTermsText] = useState("")
  const [dianxiaomiMediaToolsText, setDianxiaomiMediaToolsText] = useState("")
  const [manualProduct, setManualProduct] = useState<ManualProductInput>(defaultManualProduct)
  const [manualAttributesText, setManualAttributesText] = useState("")
  const [manualImagesText, setManualImagesText] = useState("")
  const [manualSkusText, setManualSkusText] = useState("默认规格,0,0,")
  const [productEditDraft, setProductEditDraft] = useState<ProductEditDraft | null>(null)
  const [listingEditDraft, setListingEditDraft] = useState<ListingEditDraft | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [batchPublishChecks, setBatchPublishChecks] = useState<PublishCheckResult[]>([])
  const [batchRestoreMessage, setBatchRestoreMessage] = useState("")
  const [selectorConfigMessage, setSelectorConfigMessage] = useState("")
  const [selectorCalibrationMessage, setSelectorCalibrationMessage] = useState("")
  const [selectorConfigDraft, setSelectorConfigDraft] = useState<DianxiaomiSelectorConfig | null>(null)
  const [automationLaunchDraft, setAutomationLaunchDraft] = useState<AutomationLaunchDraft>(defaultAutomationLaunchDraft)
  const [selectedAutomationPresetId, setSelectedAutomationPresetId] = useState("")
  const [automationPresetName, setAutomationPresetName] = useState("")
  const [automationPresetMessage, setAutomationPresetMessage] = useState("")
  const [automationTaskFileMessage, setAutomationTaskFileMessage] = useState("")
  const [selectedTaskFileExportId, setSelectedTaskFileExportId] = useState("")
  const [showBlockedTaskFiles, setShowBlockedTaskFiles] = useState(false)
  const [writeModeConfirmed, setWriteModeConfirmed] = useState(false)
  const [automationDryRunMessage, setAutomationDryRunMessage] = useState("")
  const [automationFillDraftMessage, setAutomationFillDraftMessage] = useState("")
  const [automationSaveDraftMessage, setAutomationSaveDraftMessage] = useState("")
  const [automationSubmitListingMessage, setAutomationSubmitListingMessage] = useState("")
  const [automationFullFlowMessage, setAutomationFullFlowMessage] = useState("")
  const [automationQueueRunMessage, setAutomationQueueRunMessage] = useState("")
  const [automationRecoveryRunMessage, setAutomationRecoveryRunMessage] = useState("")
  const [automationQueueDaemonMessage, setAutomationQueueDaemonMessage] = useState("")
  const [automationQueueDaemonInterval, setAutomationQueueDaemonInterval] = useState("300")
  const [automationQueueDaemonMaxFailures, setAutomationQueueDaemonMaxFailures] = useState("3")
  const [showAdvancedConsole, setShowAdvancedConsole] = useState(false)
  const [showDailyDetails, setShowDailyDetails] = useState(false)
  const automationStartInput = createAutomationStartInput(automationLaunchDraft)
  const automationReadinessKey = [
    automationStartInput.url ?? "",
    automationStartInput.taskFile ?? "",
    automationStartInput.selectorConfig ?? "",
    automationStartInput.mediaAutomationMode ?? "",
    automationStartInput.submitAfterSave ? "submit-after-save" : "no-submit-after-save",
    String(automationStartInput.submitMaxAttempts ?? ""),
    ...(automationStartInput.mediaAutomationTools ?? [])
  ]
  const automationStartSignature = automationReadinessKey.join("\n")

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    refetchInterval: 10000
  })

  const { data: syncedTask, refetch: refetchSyncedTask } = useQuery({
    queryKey: ["active-task"],
    queryFn: fetchActiveTask,
    refetchInterval: 10000
  })

  const { data: automationReports = [], refetch: refetchAutomationReports } = useQuery({
    queryKey: ["automation-reports"],
    queryFn: fetchAutomationReports,
    refetchInterval: 10000
  })

  const { data: automationTaskFileExports = [], refetch: refetchAutomationTaskFileExports } = useQuery({
    queryKey: ["automation-task-file-exports"],
    queryFn: fetchAutomationTaskFileExports,
    refetchInterval: 15000
  })
  const visibleTaskFileExports = automationTaskFileExports
    .filter((item) => showBlockedTaskFiles || item.launchStatus.status !== "blocked")
    .slice(0, 6)
  const blockedTaskFileExportCount = automationTaskFileExports.filter((item) => item.launchStatus.status === "blocked").length

  const { data: dianxiaomiCollectedProducts = [], refetch: refetchDianxiaomiCollectedProducts } = useQuery({
    queryKey: ["dianxiaomi-collected-products"],
    queryFn: fetchDianxiaomiCollectedProducts,
    refetchInterval: 10000
  })

  const { data: dianxiaomiProductWorkItems = [], refetch: refetchDianxiaomiProductWorkItems, isError: dianxiaomiProductWorkItemsError, error: dianxiaomiProductWorkItemsQueryError } = useQuery({
    queryKey: ["dianxiaomi-product-work-items"],
    queryFn: fetchDianxiaomiProductWorkItems,
    refetchInterval: 10000
  })

  const { data: dianxiaomiRequirementRules, refetch: refetchDianxiaomiRequirementRules } = useQuery({
    queryKey: ["dianxiaomi-requirement-rules"],
    queryFn: fetchDianxiaomiRequirementRules
  })

  const { data: selectedTaskFileExportDiff } = useQuery({
    queryKey: ["automation-task-file-export-diff", selectedTaskFileExportId],
    queryFn: () => fetchAutomationTaskFileExportDiff(selectedTaskFileExportId),
    enabled: Boolean(selectedTaskFileExportId),
    refetchInterval: selectedTaskFileExportId ? 15000 : false
  })

  const { data: automationLaunchPresets = [], refetch: refetchAutomationLaunchPresets } = useQuery({
    queryKey: ["automation-launch-presets"],
    queryFn: fetchAutomationLaunchPresets,
    refetchInterval: 15000
  })

  const { data: automationReadiness, refetch: refetchAutomationReadiness } = useQuery({
    queryKey: ["automation-readiness", ...automationReadinessKey],
    queryFn: () => fetchAutomationReadiness(automationStartInput),
    refetchInterval: 3000
  })

  const { data: automationPreflight, refetch: refetchAutomationPreflight } = useQuery({
    queryKey: ["automation-preflight", ...automationReadinessKey],
    queryFn: () => fetchAutomationPreflight(automationStartInput),
    refetchInterval: 3000
  })

  const { data: automationDryRunJobs = [], refetch: refetchAutomationDryRunJobs } = useQuery({
    queryKey: ["automation-dry-run-jobs"],
    queryFn: fetchAutomationDryRunJobs,
    refetchInterval: 3000
  })

  const { data: automationFullFlowJobs = [], refetch: refetchAutomationFullFlowJobs } = useQuery({
    queryKey: ["automation-full-flow-jobs"],
    queryFn: fetchAutomationFullFlowJobs,
    refetchInterval: 3000
  })

  const { data: automationQueueRuns = [], refetch: refetchAutomationQueueRuns, isError: automationQueueRunsError, error: automationQueueRunsQueryError } = useQuery({
    queryKey: ["automation-queue-runs"],
    queryFn: fetchAutomationQueueRuns,
    refetchInterval: 5000
  })

  const { data: automationRecoveryRuns = [], refetch: refetchAutomationRecoveryRuns } = useQuery({
    queryKey: ["automation-recovery-runs"],
    queryFn: fetchAutomationRecoveryRuns,
    refetchInterval: 5000
  })

  const { data: automationQueueDaemon, refetch: refetchAutomationQueueDaemon, isError: automationQueueDaemonError, error: automationQueueDaemonQueryError } = useQuery({
    queryKey: ["automation-queue-daemon"],
    queryFn: fetchAutomationQueueDaemon,
    refetchInterval: 3000
  })

  const { data: automationQueueDaemonHealth, refetch: refetchAutomationQueueDaemonHealth, isError: automationQueueDaemonHealthError, error: automationQueueDaemonHealthQueryError } = useQuery({
    queryKey: ["automation-queue-daemon-health"],
    queryFn: fetchAutomationQueueDaemonHealth,
    refetchInterval: 3000
  })

  const { data: profileLockArchiveReadiness, refetch: refetchProfileLockArchiveReadiness } = useQuery({
    queryKey: ["profile-lock-archive-readiness", ...automationReadinessKey],
    queryFn: () => fetchProfileLockArchiveReadiness(automationStartInput),
    refetchInterval: 5000
  })

  const { data: manualBudgetTrials = [], refetch: refetchManualBudgetTrials } = useQuery<AutomationManualStepBudgetTrialRequestResult[]>({
    queryKey: ["manual-budget-trials"],
    queryFn: () => fetchManualBudgetTrials(20),
    refetchInterval: 5000
  })

  const { data: automationUnattendedStartupCheck, refetch: refetchAutomationUnattendedStartupCheck, isError: automationUnattendedStartupCheckError, error: automationUnattendedStartupCheckQueryError } = useQuery({
    queryKey: ["automation-unattended-startup-check", ...automationReadinessKey],
    queryFn: () => fetchAutomationUnattendedStartupCheck(automationStartInput),
    refetchInterval: 5000
  })

  const { data: automationFillDraftJobs = [], refetch: refetchAutomationFillDraftJobs } = useQuery({
    queryKey: ["automation-fill-draft-jobs"],
    queryFn: fetchAutomationFillDraftJobs,
    refetchInterval: 3000
  })

  const { data: automationSaveDraftJobs = [], refetch: refetchAutomationSaveDraftJobs } = useQuery({
    queryKey: ["automation-save-draft-jobs"],
    queryFn: fetchAutomationSaveDraftJobs,
    refetchInterval: 3000
  })

  const { data: automationSubmitListingJobs = [], refetch: refetchAutomationSubmitListingJobs } = useQuery({
    queryKey: ["automation-submit-listing-jobs"],
    queryFn: fetchAutomationSubmitListingJobs,
    refetchInterval: 3000
  })

  const { data: selectorDiagnoses = [] } = useQuery({
    queryKey: ["selector-diagnoses"],
    queryFn: fetchSelectorDiagnoses,
    refetchInterval: 15000
  })

  const { data: selectorCalibrationJobs = [], refetch: refetchSelectorCalibrationJobs } = useQuery({
    queryKey: ["selector-calibration-jobs"],
    queryFn: fetchSelectorCalibrationJobs,
    refetchInterval: 3000
  })

  const { data: selectorConfig, refetch: refetchSelectorConfig } = useQuery({
    queryKey: ["selector-config"],
    queryFn: fetchSelectorConfig,
    refetchInterval: 15000
  })

  const { data: selectorConfigValidation, refetch: refetchSelectorConfigValidation } = useQuery({
    queryKey: ["selector-config-validation"],
    queryFn: fetchSelectorConfigValidation,
    refetchInterval: 15000
  })

  const { data: selectorWorkbench, refetch: refetchSelectorWorkbench } = useQuery({
    queryKey: ["selector-workbench"],
    queryFn: fetchSelectorWorkbench,
    refetchInterval: 5000
  })

  const { data: selectorConfigVersions = [], refetch: refetchSelectorConfigVersions } = useQuery({
    queryKey: ["selector-config-versions"],
    queryFn: fetchSelectorConfigVersions,
    refetchInterval: 15000
  })

  const { data: pricingRules, refetch: refetchPricingRules } = useQuery({
    queryKey: ["pricing-rules"],
    queryFn: fetchPricingRules
  })

  const selectorDraftSourceSignature = selectorWorkbench
    ? JSON.stringify({
      config: selectorWorkbench.config.config,
      diagnosisPath: selectorWorkbench.diagnosis?.diagnosisPath ?? null
    })
    : ""

  useEffect(() => {
    if (pricingRules) {
      setPricingDraft(pricingRules)
      setLogisticsTiersText(formatLogisticsTiersText(pricingRules.logisticsRateTiers ?? []))
    }
  }, [pricingRules])

  useEffect(() => {
    if (dianxiaomiRequirementRules) {
      setDianxiaomiRequirementRulesDraft(createDianxiaomiRequirementRulesDraft(dianxiaomiRequirementRules))
      setDianxiaomiRecommendedKeysText(formatLines(dianxiaomiRequirementRules.attributes.recommendedKeys))
      setDianxiaomiBlockedTermsText(formatLines(dianxiaomiRequirementRules.compliance.blockedTerms))
      setDianxiaomiMediaToolsText(formatLines(dianxiaomiRequirementRules.media.dianxiaomiTools))
    }
  }, [dianxiaomiRequirementRules])

  useEffect(() => {
    if (data) {
      setTasks(data)
      if (!activeTaskId) {
        setActiveTaskId(syncedTask?.id ?? data[0]?.id ?? "")
      }
    }
  }, [data, syncedTask, activeTaskId, setActiveTaskId, setTasks])

  useEffect(() => {
    if (selectorWorkbench) {
      setSelectorConfigDraft(createSelectorConfigDraft(selectorWorkbench))
    }
  }, [selectorDraftSourceSignature])

  useEffect(() => {
    setWriteModeConfirmed(false)
  }, [automationStartSignature])

  const activeTask = tasks.find((task) => task.id === activeTaskId) ?? tasks[0]
  const selectedAutomationPreset = automationLaunchPresets.find((preset) => preset.id === selectedAutomationPresetId) ?? null
  const canStartFillDraft = (automationReadiness?.fillDraft.ready ?? false) && writeModeConfirmed
  const canStartSaveDraft = (automationReadiness?.saveDraft.ready ?? false) && writeModeConfirmed
  const canStartSubmitListing = (automationReadiness?.submitListing.ready ?? false) && writeModeConfirmed
  const automationGateItems = [
    {
      label: "Dry run",
      readiness: automationReadiness?.dryRun
    },
    {
      label: "Repair preview",
      readiness: automationReadiness?.repairPreview
    },
    {
      label: "Repair apply",
      readiness: automationReadiness?.repairApply
    },
    {
      label: "Fill draft",
      readiness: automationReadiness?.fillDraft
    },
    {
      label: "Save draft",
      readiness: automationReadiness?.saveDraft
    },
    {
      label: "Submit listing",
      readiness: automationReadiness?.submitListing
    }
  ]

  const { data: publishCheck } = useQuery({
    queryKey: ["publish-check", activeTask?.id],
    queryFn: () => fetchPublishCheck(activeTask!.id),
    enabled: Boolean(activeTask?.id),
    refetchInterval: 15000
  })

  useEffect(() => {
    if (activeTask) {
      setProductEditDraft(createProductEditDraft(activeTask))
      setListingEditDraft(createListingEditDraft(activeTask))
    }
  }, [activeTask?.id, activeTask?.updatedAt])

  const syncer = useMutation({
    mutationFn: syncActiveTask,
    onSuccess: async (task) => {
      setActiveTaskId(task.id)
      await refetchSyncedTask()
    }
  })

  const planner = useMutation({
    mutationFn: planTask,
    onSuccess: async () => {
      await refetch()
      await refetchSyncedTask()
    }
  })

  const csvImporter = useMutation({
    mutationFn: importCsvProducts,
    onSuccess: async (result) => {
      await refetch()
      await refetchSyncedTask()
      if (result.tasks[0]) {
        setActiveTaskId(result.tasks[0].id)
      }
    }
  })

  const excelImporter = useMutation({
    mutationFn: importExcelProducts,
    onSuccess: async (result) => {
      await refetch()
      await refetchSyncedTask()
      if (result.tasks[0]) {
        setActiveTaskId(result.tasks[0].id)
      }
    }
  })

  const pricingUpdater = useMutation({
    mutationFn: updatePricingRules,
    onSuccess: async () => {
      await refetchPricingRules()
      await refetch()
    }
  })

  const dianxiaomiRequirementRulesUpdater = useMutation({
    mutationFn: updateDianxiaomiRequirementRules,
    onSuccess: async () => {
      await refetchDianxiaomiRequirementRules()
      await refetchDianxiaomiProductWorkItems()
      await refetch()
    }
  })

  const manualCreator = useMutation({
    mutationFn: createManualProductTask,
    onSuccess: async (task) => {
      await refetch()
      await refetchSyncedTask()
      setActiveTaskId(task.id)
      setManualProduct(defaultManualProduct)
      setManualAttributesText("")
      setManualImagesText("")
      setManualSkusText("默认规格,0,0,")
    }
  })

  const dianxiaomiCollectedTaskCreator = useMutation({
    mutationFn: createTaskFromDianxiaomiCollectedProduct,
    onSuccess: async (result) => {
      setActiveTaskId(result.task.id)
      await refetch()
      await refetchSyncedTask()
      await refetchDianxiaomiCollectedProducts()
    }
  })

  const dianxiaomiWorkItemTaskCreator = useMutation({
    mutationFn: createTaskFromDianxiaomiProductWorkItem,
    onSuccess: async (result) => {
      setActiveTaskId(result.task.id)
      setAutomationLaunchDraft((current) => ({
        ...current,
        url: result.workItem.pageUrl || current.url
      }))
      await refetch()
      await refetchSyncedTask()
      await refetchDianxiaomiProductWorkItems()
    }
  })

  const dianxiaomiWorkItemRetryAfterFixer = useMutation({
    mutationFn: retryDianxiaomiProductWorkItemAfterFix,
    onSuccess: async () => {
      await refetchDianxiaomiProductWorkItems()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const productUpdater = useMutation({
    mutationFn: updateTaskProduct,
    onSuccess: async (task) => {
      setActiveTaskId(task.id)
      await refetch()
      await refetchSyncedTask()
    }
  })

  const draftUpdater = useMutation({
    mutationFn: updateTaskDraft,
    onSuccess: async (task) => {
      setActiveTaskId(task.id)
      await refetch()
      await refetchSyncedTask()
    }
  })

  const draftRestorer = useMutation({
    mutationFn: restoreTaskDraftVersion,
    onSuccess: async (task) => {
      setActiveTaskId(task.id)
      await refetch()
      await refetchSyncedTask()
    }
  })

  const reviewer = useMutation({
    mutationFn: reviewTask,
    onSuccess: async (task) => {
      setActiveTaskId(task.id)
      setReviewNote("")
      await refetch()
      await refetchSyncedTask()
    }
  })

  const batchReviewer = useMutation({
    mutationFn: reviewTasks,
    onSuccess: async (tasks) => {
      if (tasks[0]) {
        setActiveTaskId(tasks[0].id)
      }
      setSelectedTaskIds([])
      setReviewNote("")
      await refetch()
      await refetchSyncedTask()
    }
  })

  const batchPublishChecker = useMutation({
    mutationFn: fetchPublishChecks,
    onSuccess: (checks) => {
      setBatchPublishChecks(checks)
    }
  })

  const batchDraftRestorer = useMutation({
    mutationFn: restoreLatestAiDraftVersions,
    onSuccess: async (result) => {
      if (result.restored[0]) {
        setActiveTaskId(result.restored[0].id)
      }
      setBatchRestoreMessage(`已恢复 ${result.restored.length} 个任务，跳过 ${result.skipped.length} 个任务`)
      setSelectedTaskIds([])
      await refetch()
      await refetchSyncedTask()
    }
  })

  const automationPresetCreator = useMutation({
    mutationFn: createAutomationLaunchPreset,
    onSuccess: async (preset) => {
      setSelectedAutomationPresetId(preset.id)
      setAutomationPresetName(preset.name)
      setAutomationLaunchDraft(automationDraftFromInput(preset.input))
      setAutomationPresetMessage(`preset saved: ${preset.name}`)
      await refetchAutomationLaunchPresets()
    },
    onError: (error) => {
      setAutomationPresetMessage(getErrorMessage(error))
    }
  })

  const automationPresetUpdater = useMutation({
    mutationFn: updateAutomationLaunchPreset,
    onSuccess: async (preset) => {
      setSelectedAutomationPresetId(preset.id)
      setAutomationPresetName(preset.name)
      setAutomationLaunchDraft(automationDraftFromInput(preset.input))
      setAutomationPresetMessage(`preset updated: ${preset.name}`)
      await refetchAutomationLaunchPresets()
    },
    onError: (error) => {
      setAutomationPresetMessage(getErrorMessage(error))
    }
  })

  const automationPresetDeleter = useMutation({
    mutationFn: deleteAutomationLaunchPreset,
    onSuccess: async () => {
      setSelectedAutomationPresetId("")
      setAutomationPresetName("")
      setAutomationPresetMessage("preset deleted")
      await refetchAutomationLaunchPresets()
    },
    onError: (error) => {
      setAutomationPresetMessage(getErrorMessage(error))
    }
  })

  const automationTaskFileExporter = useMutation({
    mutationFn: exportAutomationTaskFile,
    onSuccess: async (result) => {
      setAutomationLaunchDraft((current) => ({
        ...current,
        taskFile: result.taskFile
      }))
      setAutomationTaskFileMessage(`task file refreshed: ${result.taskFile}`)
      setSelectedTaskFileExportId(result.exportId)
      await refetchAutomationTaskFileExports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: (error) => {
      setAutomationTaskFileMessage(getErrorMessage(error))
    }
  })

  const automationDryRunner = useMutation({
    mutationFn: startAutomationDryRun,
    onSuccess: async (result) => {
      setAutomationDryRunMessage(`dry-run started: ${result.logPath}`)
      await refetchAutomationDryRunJobs()
      await refetchAutomationReports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: async (error) => {
      setAutomationDryRunMessage(getErrorMessage(error))
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    }
  })

  const automationFullFlowRunner = useMutation({
    mutationFn: startAutomationFullFlow,
    onSuccess: async (result) => {
      setAutomationFullFlowMessage(`full-flow started: ${result.artifactDir}`)
      await refetchAutomationFullFlowJobs()
      await refetchAutomationDryRunJobs()
      await refetchAutomationFillDraftJobs()
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: async (error) => {
      setAutomationFullFlowMessage(getErrorMessage(error))
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    }
  })

  const automationQueueRunner = useMutation({
    mutationFn: startAutomationQueueRun,
    onSuccess: async (result) => {
      const retrySummary = result.autoRetryReleasedIds.length > 0
        ? `, released ${result.autoRetryReleasedIds.length} safe recovery item(s)`
        : ""
      setAutomationQueueRunMessage(`queue-run started ${result.queued} full-flow jobs, skipped ${result.skipped}${retrySummary}`)
      await refetchAutomationQueueRuns()
      await refetchAutomationFullFlowJobs()
      await refetchAutomationDryRunJobs()
      await refetchAutomationFillDraftJobs()
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchDianxiaomiProductWorkItems()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationQueueRunMessage(getErrorMessage(error))
      await refetchAutomationQueueRuns()
    }
  })

  const automationRecoveryRunner = useMutation({
    mutationFn: startAutomationRecoveryRun,
    onSuccess: async (result) => {
      setAutomationRecoveryRunMessage(`recovery-run started ${result.queued} item(s), skipped ${result.skipped}`)
      await refetchAutomationRecoveryRuns()
      await refetchAutomationFullFlowJobs()
      await refetchAutomationDryRunJobs()
      await refetchAutomationFillDraftJobs()
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchDianxiaomiProductWorkItems()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationRecoveryRunMessage(getErrorMessage(error))
      await refetchAutomationRecoveryRuns()
    }
  })

  const manualBudgetTrialRunner = useMutation({
    mutationFn: startManualBudgetTrial,
    onSuccess: async (result) => {
      const flowSummary = result.flowJobIds.length > 0 ? `, flows ${result.flowJobIds.length}` : ""
      const skippedSummary = result.skippedItems.length > 0 ? `, skipped ${result.skippedItems.length}` : ""
      setAutomationQueueDaemonMessage(`manual-budget trial ${result.status}: ${result.message}${flowSummary}${skippedSummary}`)
      await refetchAutomationFullFlowJobs()
      await refetchAutomationDryRunJobs()
      await refetchAutomationFillDraftJobs()
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchDianxiaomiProductWorkItems()
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchManualBudgetTrials()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchManualBudgetTrials()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const manualBudgetValidationRunner = useMutation({
    mutationFn: startNextManualBudgetValidationRun,
    onSuccess: async (result) => {
      const flowSummary = result.flowJobIds.length > 0 ? `, flows ${result.flowJobIds.length}` : ""
      const skippedSummary = result.skippedItems.length > 0 ? `, skipped ${result.skippedItems.length}` : ""
      setAutomationQueueDaemonMessage(`manual-budget validation ${result.status}: ${result.message}${flowSummary}${skippedSummary}`)
      await refetchAutomationFullFlowJobs()
      await refetchAutomationDryRunJobs()
      await refetchAutomationFillDraftJobs()
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchDianxiaomiProductWorkItems()
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchManualBudgetTrials()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchManualBudgetTrials()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const profileLockArchiver = useMutation({
    mutationFn: archiveStaleProfileLocks,
    onSuccess: async (result) => {
      setAutomationQueueDaemonMessage(`profile lock archive ${result.status}: ${result.message}`)
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchProfileLockArchiveReadiness()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchAutomationQueueDaemonHealth()
      await refetchProfileLockArchiveReadiness()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const automationQueueDaemonStarter = useMutation({
    mutationFn: startAutomationQueueDaemon,
    onSuccess: async (state) => {
      setAutomationQueueDaemonMessage(`queue daemon ${state.status.toLowerCase()}: interval ${state.intervalSeconds}s`)
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
      await refetchAutomationQueueRuns()
      await refetchAutomationFullFlowJobs()
      await refetchDianxiaomiProductWorkItems()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const automationQueueDaemonPauser = useMutation({
    mutationFn: pauseAutomationQueueDaemon,
    onSuccess: async (state) => {
      setAutomationQueueDaemonMessage(`queue daemon ${state.status.toLowerCase()}`)
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const automationQueueDaemonTicker = useMutation({
    mutationFn: tickAutomationQueueDaemon,
    onSuccess: async (tick) => {
      setAutomationQueueDaemonMessage(`queue daemon tick ${tick.status}: ${tick.reason ?? tick.error ?? "done"}`)
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
      await refetchAutomationQueueRuns()
      await refetchAutomationFullFlowJobs()
      await refetchDianxiaomiProductWorkItems()
    },
    onError: async (error) => {
      setAutomationQueueDaemonMessage(getErrorMessage(error))
      await refetchAutomationQueueDaemon()
      await refetchAutomationQueueDaemonHealth()
      await refetchAutomationUnattendedStartupCheck()
    }
  })

  const automationFillDraftRunner = useMutation({
    mutationFn: startAutomationFillDraft,
    onSuccess: async (result) => {
      setAutomationFillDraftMessage(`fill-draft started: ${result.logPath}`)
      await refetchAutomationFillDraftJobs()
      await refetchAutomationReports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: async (error) => {
      setAutomationFillDraftMessage(getErrorMessage(error))
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    }
  })

  const automationSaveDraftRunner = useMutation({
    mutationFn: startAutomationSaveDraft,
    onSuccess: async (result) => {
      setAutomationSaveDraftMessage(`save-draft started: ${result.logPath}`)
      await refetchAutomationSaveDraftJobs()
      await refetchAutomationReports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: async (error) => {
      setAutomationSaveDraftMessage(getErrorMessage(error))
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    }
  })

  const automationSubmitListingRunner = useMutation({
    mutationFn: startAutomationSubmitListing,
    onSuccess: async (result) => {
      setAutomationSubmitListingMessage(`submit-listing started: ${result.logPath}`)
      await refetchAutomationSubmitListingJobs()
      await refetchAutomationReports()
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    },
    onError: async (error) => {
      setAutomationSubmitListingMessage(getErrorMessage(error))
      await refetchAutomationReadiness()
      await refetchAutomationPreflight()
    }
  })

  const selectorConfigSaver = useMutation({
    mutationFn: saveSelectorConfig,
    onSuccess: async (result) => {
      setSelectorConfigMessage(`selector config saved: ${result.configPath}`)
      setSelectorConfigDraft(cloneSelectorConfig(result.config))
      await refetchSelectorConfig()
      await refetchSelectorConfigValidation()
      await refetchSelectorWorkbench()
      await refetchSelectorConfigVersions()
      await refetchAutomationPreflight()
    },
    onError: (error) => {
      setSelectorConfigMessage(getErrorMessage(error))
    }
  })

  const selectorConfigRestorer = useMutation({
    mutationFn: restoreSelectorConfigVersionWithInput,
    onSuccess: async (result) => {
      setSelectorConfigMessage(`selector config restored: ${result.restoredVersion.id}`)
      setSelectorConfigDraft(cloneSelectorConfig(result.config))
      await refetchSelectorConfig()
      await refetchSelectorConfigValidation()
      await refetchSelectorWorkbench()
      await refetchSelectorConfigVersions()
      await refetchAutomationPreflight()
    },
    onError: (error) => {
      setSelectorConfigMessage(getErrorMessage(error))
    }
  })

  const selectorConfigGenerator = useMutation({
    mutationFn: generateSelectorConfig,
    onSuccess: async (result) => {
      setSelectorConfigMessage(`已生成选择器配置：${result.configPath}`)
      await refetchSelectorConfig()
      await refetchSelectorConfigValidation()
      await refetchSelectorWorkbench()
      await refetchSelectorConfigVersions()
      await refetchAutomationPreflight()
    }
  })

  const selectorCalibrationRunner = useMutation({
    mutationFn: startSelectorCalibration,
    onSuccess: async (result) => {
      setSelectorCalibrationMessage(`selector calibration started: ${result.artifactDir}`)
      await refetchSelectorCalibrationJobs()
      await refetchSelectorWorkbench()
    },
    onError: async (error) => {
      setSelectorCalibrationMessage(getErrorMessage(error))
      await refetchSelectorCalibrationJobs()
      await refetchSelectorWorkbench()
    }
  })

  const setPricingField = (field: keyof PricingRules, value: string) => {
    setPricingDraft((current) => current ? { ...current, [field]: Number(value) } : current)
  }

  const setDianxiaomiRequirementPresetName = (value: string) => {
    setDianxiaomiRequirementRulesDraft((current) => current ? { ...current, presetName: value } : current)
  }

  const setDianxiaomiRequirementNumber = (
    group: "title" | "images" | "media" | "sku" | "price" | "stock" | "attributes",
    field: string,
    value: string
  ) => {
    setDianxiaomiRequirementRulesDraft((current) => current ? {
      ...current,
      [group]: {
        ...current[group],
        [field]: Number(value)
      }
    } : current)
  }

  const setDianxiaomiRequirementRequired = (
    group: "title" | "images" | "media" | "sku" | "price" | "stock" | "attributes" | "compliance",
    required: boolean
  ) => {
    setDianxiaomiRequirementRulesDraft((current) => current ? {
      ...current,
      [group]: {
        ...current[group],
        required
      }
    } : current)
  }

  const setDianxiaomiMediaBoolean = (
    field: "requireImageTranslation" | "requireWhiteBackground" | "requireSizeNormalization" | "requireImageEditorReview",
    value: boolean
  ) => {
    setDianxiaomiRequirementRulesDraft((current) => current ? {
      ...current,
      media: {
        ...current.media,
        [field]: value
      }
    } : current)
  }

  const setDianxiaomiMediaText = (
    field: "targetLanguage",
    value: string
  ) => {
    setDianxiaomiRequirementRulesDraft((current) => current ? {
      ...current,
      media: {
        ...current.media,
        [field]: value
      }
    } : current)
  }

  const setManualField = (field: keyof ManualProductInput, value: string) => {
    setManualProduct((current) => ({
      ...current,
      [field]: ["supplierPriceCny", "estimatedDomesticShippingCny", "estimatedWeightKg", "stock"].includes(field)
        ? Number(value)
        : value
    }))
  }

  const setProductEditField = (field: keyof ProductEditDraft, value: string) => {
    setProductEditDraft((current) => current ? {
      ...current,
      [field]: ["supplierPriceCny", "estimatedDomesticShippingCny", "estimatedWeightKg", "stock"].includes(field)
        ? Number(value)
        : value
    } : current)
  }

  const setListingEditField = (field: keyof ListingEditDraft, value: string) => {
    setListingEditDraft((current) => current ? { ...current, [field]: value } : current)
  }

  const buildManualProductPayload = (): ManualProductInput => {
    const productAttributes = parseAttributeText(manualAttributesText)
    const skus = parseSkusText(manualSkusText, {
      costCny: manualProduct.supplierPriceCny,
      stock: manualProduct.stock,
      attributes: productAttributes
    })

    return {
      ...manualProduct,
      attributes: productAttributes,
      images: parseImagesText(manualImagesText),
      skus: skus.length > 0 ? skus : undefined
    }
  }

  const buildProductUpdatePayload = (): ProductUpdateInput | null => {
    if (!productEditDraft) {
      return null
    }

    const attributes = parseAttributeText(productEditDraft.attributesText)
    return {
      title: productEditDraft.title,
      category: productEditDraft.category,
      supplierPriceCny: productEditDraft.supplierPriceCny,
      estimatedDomesticShippingCny: productEditDraft.estimatedDomesticShippingCny,
      estimatedWeightKg: productEditDraft.estimatedWeightKg,
      stock: productEditDraft.stock,
      sourceUrl: productEditDraft.sourceUrl,
      attributes,
      images: parseImagesText(productEditDraft.imagesText),
      skus: parseSkusText(productEditDraft.skusText, {
        costCny: productEditDraft.supplierPriceCny,
        stock: productEditDraft.stock,
        attributes
      })
    }
  }

  const buildDraftUpdatePayload = (): DraftUpdateInput | null => {
    if (!listingEditDraft) {
      return null
    }

    return {
      listingTitle: listingEditDraft.listingTitle,
      sellingPoints: parseLines(listingEditDraft.sellingPointsText),
      description: listingEditDraft.description,
      categoryPath: parseLines(listingEditDraft.categoryPathText),
      attributes: parseAttributeText(listingEditDraft.attributesText),
      skuPricing: parseLines(listingEditDraft.skuPricingText).map((line) => {
        const [skuId, skuName, salePriceUsd, stock, attributesText] = line.split(",")
        return {
          skuId: skuId.trim(),
          skuName: skuName?.trim(),
          salePriceUsd: Number(salePriceUsd),
          stock: Math.max(0, Math.floor(Number(stock))),
          attributes: parseAttributeText(attributesText ?? "")
        }
      }).filter((sku) => sku.skuId)
    }
  }

  const buildPricingPayload = () => pricingDraft
    ? { ...pricingDraft, logisticsRateTiers: parseLogisticsTiersText(logisticsTiersText) }
    : null

  const buildDianxiaomiRequirementRulesPayload = () => dianxiaomiRequirementRulesDraft
    ? {
        ...dianxiaomiRequirementRulesDraft,
        attributes: {
          ...dianxiaomiRequirementRulesDraft.attributes,
          recommendedKeys: parseLines(dianxiaomiRecommendedKeysText)
        },
        compliance: {
          ...dianxiaomiRequirementRulesDraft.compliance,
          blockedTerms: parseLines(dianxiaomiBlockedTermsText)
        },
        media: {
          ...dianxiaomiRequirementRulesDraft.media,
          dianxiaomiTools: parseLines(dianxiaomiMediaToolsText)
        }
      }
    : null

  const readyLabel = syncer.isPending
    ? "正在同步到店小秘..."
    : syncedTask?.id === activeTask?.id
      ? "已准备推送到店小秘"
      : "待同步到店小秘"

  const progress = activeTask ? getTaskProgress(activeTask) : 0
  const canSyncToStore = activeTask?.status === "approved" && publishCheck?.canPublish === true
  const selectedReviewableTaskIds = selectedTaskIds.filter((taskId) => tasks.some((task) => task.id === taskId && task.status !== "approved" && task.status !== "rejected"))
  const batchPublishableCount = batchPublishChecks.filter((check) => check.canPublish).length
  const batchBlockingCount = batchPublishChecks.length - batchPublishableCount
  const latestQueueTick = automationQueueDaemon?.ticks[0] ?? null
  const latestFullFlowJob = automationFullFlowJobs[0] ?? null
  const readyWorkItems = dianxiaomiProductWorkItems.filter((item) => item.status === "ready-for-automation")
  const blockedWorkItems = dianxiaomiProductWorkItems.filter((item) => item.status === "blocked")
  const browserRecoveryCandidateCount = blockedWorkItems.filter((item) =>
    item.repairPlan?.status === "auto-ready"
    && item.repairPlan.canAutoRepair
    && item.repairPlan.actions.length > 0
    && item.repairPlan.actions.some((action) =>
      action.automation === "auto"
      && ["fill-single-field", "fill-attributes", "fill-sku-pricing", "run-media-tool"].includes(action.payload?.writer ?? "")
    )
    && item.repairPlan.actions.every((action) =>
      action.automation === "auto"
      && (
        action.payload?.writer
          ? ["fill-single-field", "fill-attributes", "fill-sku-pricing", "run-media-tool"].includes(action.payload.writer)
          : action.required === false
      )
    )
  ).length
  const backendConnectionError = [
    dianxiaomiProductWorkItemsError ? dianxiaomiProductWorkItemsQueryError : null,
    automationQueueRunsError ? automationQueueRunsQueryError : null,
    automationQueueDaemonError ? automationQueueDaemonQueryError : null,
    automationQueueDaemonHealthError ? automationQueueDaemonHealthQueryError : null,
    automationUnattendedStartupCheckError ? automationUnattendedStartupCheckQueryError : null
  ].find(Boolean)
  const {
    directSafeRetryCandidateCount,
    releasedBrowserRecoveryCandidateCount,
    displayedBrowserRecoveryCandidateCount,
    pausedBrowserRecoveryCandidateCount,
    startupCalibrationCheck,
    startupBlockingChecks,
    startupWarningChecks,
    primaryStartupProblem,
    dailyBackendOffline,
    dailyBackendOfflineMessage,
    dailyTrialGate,
    dailyStartupCanStart,
    dailyCanStart,
    dailyAutomaticPass,
    dailyManualTriggers,
    dailyAutomaticPassTone,
    dailyManualTriggerTone,
    operatorAction,
    dailyModeLabel,
    dailyModeTone,
    dailyTrialTone,
    dailyTrialLabel,
    dailyActionTitle,
    dailyActionDetail,
    repeatedRecoveryAlert,
    validationTriageAlert,
    firstManualBudgetItem,
    publishFailureSummary,
    dailyAlerts
  } = useDailyDashboard({
    automationQueueRuns,
    automationFullFlowJobs,
    dianxiaomiProductWorkItems,
    automationQueueDaemon,
    automationQueueDaemonHealth,
    automationUnattendedStartupCheck,
    backendConnectionError
  })
  const dailyMediaAutomationTools = automationStartInput.mediaAutomationTools && automationStartInput.mediaAutomationTools.length > 0
    ? automationStartInput.mediaAutomationTools
    : defaultDailyMediaAutomationTools
  const defaultQueueDaemonInput = {
    ...automationStartInput,
    mediaAutomationMode: "unattended-apply" as const,
    mediaAutomationTools: dailyMediaAutomationTools,
    intervalSeconds: Number.parseInt(automationQueueDaemonInterval, 10) || 300,
    maxConsecutiveFailures: Number.parseInt(automationQueueDaemonMaxFailures, 10) || 3,
    limit: 5,
    submitAfterSave: true
  }
  const dailyTrialQueueRunInput = {
    ...automationStartInput,
    mediaAutomationMode: "unattended-apply" as const,
    mediaAutomationTools: dailyMediaAutomationTools,
    limit: 3,
    submitAfterSave: true
  }
  const defaultRecoveryRunInput = {
    ...automationStartInput,
    mediaAutomationMode: "unattended-apply" as const,
    mediaAutomationTools: dailyMediaAutomationTools,
    submitAfterSave: true,
    limit: 5
  }
  const dailySelectorCalibrationInput = {
    headed: true,
    sampleMediaActions: true,
    mediaAutomationTools: dailyMediaAutomationTools
  }
  const requestManualBudgetTrial = (proposal: AutomationManualStepBudgetTrialProposal) => {
    void manualBudgetTrialRunner.mutateAsync({
      ...automationStartInput,
      candidateKey: proposal.candidateKey,
      rollbackAcknowledged: true,
      acceptedRollbackCriteria: proposal.rollbackCriteria,
      mediaAutomationMode: "unattended-apply",
      mediaAutomationTools: dailyMediaAutomationTools,
      submitAfterSave: true
    })
  }

  const requestNextManualBudgetValidation = () => {
    void manualBudgetValidationRunner.mutateAsync({
      ...automationStartInput,
      mediaAutomationMode: "unattended-apply",
      mediaAutomationTools: dailyMediaAutomationTools,
      submitAfterSave: true
    })
  }

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((item) => item !== taskId)
        : [...current, taskId]
    )
  }

  return (
    <div className={`app-shell ${showAdvancedConsole ? "advanced-mode" : ""}`}>
      {!showAdvancedConsole ? (
        <main className="daily-workspace">
          <section className={`daily-console ${dailyModeTone}`}>
            <div className="daily-console-head">
              <div>
                <p className="eyebrow">Default Entry</p>
                <h1>无人值守主流程</h1>
                <p>唯一默认入口：只处理店小秘已采集商品，自动修改、处理图片、保存并点发布；Temu 核价和最终上架保留人工确认。</p>
              </div>
              <strong className={`daily-mode-badge ${dailyModeTone}`}>{dailyModeLabel}</strong>
            </div>

            <div className="daily-section">
              <div className="daily-section-head">
                <strong>状态</strong>
                <span>主指标只统计无人值守主流程</span>
              </div>
              <div className="daily-status-strip main-kpis">
                <DailyMetric
                  label="自动通过率"
                  value={dailyAutomaticPass.rate === null ? "--" : `${Math.round(dailyAutomaticPass.rate * 100)}%`}
                  detail={dailyAutomaticPass.finished > 0 ? `${dailyAutomaticPass.completed}/${dailyAutomaticPass.finished} completed` : "等待自动任务完成"}
                  tone={dailyAutomaticPassTone}
                />
                <DailyMetric
                  label="单品人工触发"
                  value={dailyManualTriggers.productCount > 0 ? dailyManualTriggers.average.toFixed(2) : "0.00"}
                  detail={`${dailyManualTriggers.triggerCount}/${dailyManualTriggers.productCount} triggers/products`}
                  tone={dailyManualTriggerTone}
                />
                <DailyMetric label="待处理队列" value={String(readyWorkItems.length)} detail="ready 商品" tone={readyWorkItems.length > 0 ? "good" : "neutral"} />
                <DailyMetric label="启动检查" value={dailyBackendOffline ? "离线" : automationUnattendedStartupCheck?.status ?? "检查中"} detail={dailyTrialLabel} tone={dailyBackendOffline || automationUnattendedStartupCheck?.status === "blocked" ? "bad" : automationUnattendedStartupCheck?.status === "ready" ? "good" : "warn"} />
              </div>
            </div>

            <div className="daily-section">
              <div className="daily-section-head">
                <strong>告警</strong>
                <span>{dailyAlerts.length > 0 ? `${dailyAlerts.length} 条` : "无阻断"}</span>
              </div>
              {dailyAlerts.length > 0 ? (
                <div className="daily-alert-list">
                  {dailyAlerts.slice(0, 4).map((alert) => (
                    <div key={alert.id} className={`daily-alert ${alert.tone}`}>
                      <strong>{alert.title}</strong>
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="daily-alert empty">
                  <strong>可以按流程运行</strong>
                  <span>当前没有需要员工判断的默认流程告警。</span>
                </div>
              )}
            </div>

            <div className="daily-section">
              <div className="daily-section-head">
                <strong>动作</strong>
                <span>{dailyActionTitle}</span>
              </div>
              <div className={`daily-action-state ${dailyModeTone}`}>
                <strong>{dailyActionTitle}</strong>
                <p>{dailyActionDetail}</p>
              </div>
              <div className="daily-console-actions">
                <button
                  className="primary-button"
                  onClick={() => void automationQueueDaemonStarter.mutateAsync(defaultQueueDaemonInput)}
                  disabled={automationQueueDaemonStarter.isPending || !dailyCanStart}
                >
                  {automationQueueDaemonStarter.isPending ? "正在启动..." : automationQueueDaemon?.status === "ACTIVE" ? "运行中" : dailyTrialGate.status === "passed" ? "开始无人值守" : "等待试跑通过"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void automationQueueDaemonPauser.mutateAsync()}
                  disabled={automationQueueDaemonPauser.isPending || automationQueueDaemon?.status !== "ACTIVE"}
                >
                  {automationQueueDaemonPauser.isPending ? "正在暂停..." : "暂停"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void automationQueueRunner.mutateAsync(dailyTrialQueueRunInput)}
                  disabled={automationQueueRunner.isPending || !dailyStartupCanStart}
                >
                  {automationQueueRunner.isPending ? "试跑中..." : "小批量试跑"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => void selectorCalibrationRunner.mutateAsync(dailySelectorCalibrationInput)}
                  disabled={selectorCalibrationRunner.isPending || dailyBackendOffline}
                >
                  {selectorCalibrationRunner.isPending ? "校准中..." : "生产校准"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => setShowDailyDetails((current) => !current)}
                >
                  {showDailyDetails ? "收起验收" : "验收明细"}
                </button>
                <button
                  className="ghost-button"
                  onClick={() => setShowAdvancedConsole(true)}
                >
                  高级区
                </button>
              </div>
              <div className="daily-mini-feed compact">
                <div>
                  <strong>最近运行</strong>
                  <span>{latestQueueTick ? `${latestQueueTick.category}: ${latestQueueTick.reason ?? latestQueueTick.error ?? "无异常"}` : "暂无自动轮询"}</span>
                </div>
                <div>
                  <strong>最近任务</strong>
                  <span>{latestFullFlowJob ? `${latestFullFlowJob.status}: ${latestFullFlowJob.error ?? latestFullFlowJob.id}` : "暂无自动任务"}</span>
                </div>
              </div>
              {automationQueueDaemonMessage ? <p className="daily-message">{automationQueueDaemonMessage}</p> : null}
              {automationQueueRunMessage ? <p className="daily-message">{automationQueueRunMessage}</p> : null}
              {selectorCalibrationMessage ? <p className="daily-message">{selectorCalibrationMessage}</p> : null}
            </div>
          </section>

          {showDailyDetails ? (
            <section className="daily-grid daily-validation-grid">
              <article className="daily-panel">
                <div className="daily-panel-head">
                  <strong>启动验收</strong>
                  <span>{startupBlockingChecks.length} blocked / {startupWarningChecks.length} warning</span>
                </div>
                <div className="daily-check-list">
                  {startupCalibrationCheck ? (
                    <div className={`daily-check ${startupCalibrationCheck.status}`}>
                      <strong>真实店小秘页面校准</strong>
                      <span>{startupCalibrationCheck.message}</span>
                    </div>
                  ) : null}
                  {startupBlockingChecks
                    .filter((item) => item.id !== "real-dianxiaomi-calibration")
                    .slice(0, 4)
                    .map((item) => (
                      <div key={item.id} className={`daily-check ${item.status}`}>
                        <strong>{item.label}</strong>
                        <span>{item.message}</span>
                      </div>
                    ))}
                  {startupBlockingChecks.length === 0 && startupWarningChecks.length === 0 ? (
                    <div className="daily-check pass">
                      <strong>启动条件正常</strong>
                      <span>可以启动无人值守队列。</span>
                    </div>
                  ) : null}
                </div>
                <div className="daily-mode-actions compact">
                  <button
                    className="ghost-button small-button"
                    onClick={() => void selectorCalibrationRunner.mutateAsync({ headed: true })}
                    disabled={selectorCalibrationRunner.isPending}
                  >
                    {selectorCalibrationRunner.isPending ? "校准中..." : "打开页面校准"}
                  </button>
                  <button
                    className="ghost-button small-button"
                    onClick={() => void automationQueueDaemonTicker.mutateAsync()}
                    disabled={automationQueueDaemonTicker.isPending || automationQueueDaemon?.status !== "ACTIVE"}
                  >
                    {automationQueueDaemonTicker.isPending ? "运行中..." : "立即检查一次"}
                  </button>
                </div>
              </article>

              <article className="daily-panel">
                <div className="daily-panel-head">
                  <strong>小批量试跑</strong>
                  <span>{dailyTrialLabel}</span>
                </div>
                <p className={`daily-message daily-trial-gate ${dailyTrialGate.status}`}>{dailyTrialGate.message}</p>
                <div className="daily-trial-summary">
                  {dailyTrialGate.details.map((item) => (
                    <div key={item.label} className={`daily-trial-stat ${item.tone}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <div className={`daily-trial-recovery ${dailyTrialGate.recovery.tone}`}>
                  <div>
                    <strong>{dailyTrialGate.recovery.title}</strong>
                    <span>{dailyTrialGate.recovery.message}</span>
                  </div>
                  <div className="daily-trial-actions">
                    {dailyTrialGate.recovery.actions.map((action) => <span key={action}>{action}</span>)}
                  </div>
                </div>
                {dailyTrialGate.failures.length > 0 ? (
                  <div className="daily-trial-failures">
                    {dailyTrialGate.failures.map((failure) => <span key={failure}>{failure}</span>)}
                  </div>
                ) : null}
              </article>
            </section>
          ) : null}
        </main>
      ) : (
        <>
      <aside className="sidebar">
        <div className="brand-panel">
          <p className="eyebrow">Advanced</p>
          <h1>高级区</h1>
          <p className="subtle">manual、review、repair 和诊断工具只用于开发校准、故障恢复或临时兜底，不进入日常默认主路径。</p>
        </div>

        <div className="queue-panel">
          <div className="queue-head">
            <strong>商品任务</strong>
            <p>{isLoading ? "正在加载..." : `${tasks.length} 个商品任务`}</p>
          </div>
          <div className="review-actions">
            <button
              className="primary-button small-button"
              onClick={() => void batchReviewer.mutateAsync({ taskIds: selectedReviewableTaskIds, decision: "approve", note: reviewNote })}
              disabled={batchReviewer.isPending || selectedReviewableTaskIds.length === 0}
            >
              批量通过
            </button>
            <button
              className="ghost-button small-button"
              onClick={() => void batchReviewer.mutateAsync({ taskIds: selectedReviewableTaskIds, decision: "request_changes", note: reviewNote })}
              disabled={batchReviewer.isPending || selectedReviewableTaskIds.length === 0}
            >
              批量退回
            </button>
            <button
              className="ghost-button danger-button small-button"
              onClick={() => void batchReviewer.mutateAsync({ taskIds: selectedReviewableTaskIds, decision: "reject", note: reviewNote })}
              disabled={batchReviewer.isPending || selectedReviewableTaskIds.length === 0}
            >
              批量驳回
            </button>
          </div>
          <div className="review-actions">
            <button
              className="ghost-button small-button"
              onClick={() => void batchPublishChecker.mutateAsync(selectedTaskIds)}
              disabled={batchPublishChecker.isPending || selectedTaskIds.length === 0}
            >
              批量检查
            </button>
            <button
              className="ghost-button small-button"
              onClick={() => void batchDraftRestorer.mutateAsync(selectedTaskIds)}
              disabled={batchDraftRestorer.isPending || selectedTaskIds.length === 0}
            >
              批量恢复 AI 草稿
            </button>
          </div>
          {batchRestoreMessage ? (
            <div className="import-result">
              <p>{batchRestoreMessage}</p>
            </div>
          ) : null}
          {batchPublishChecks.length > 0 ? (
            <div className="import-result">
              <p>发布前检查：{batchPublishableCount} 个可发布，{batchBlockingCount} 个需处理</p>
              <div className="import-warnings">
                {batchPublishChecks.slice(0, 6).map((check) => {
                  const task = tasks.find((item) => item.id === check.taskId)
                  return (
                    <span key={check.taskId}>
                      {task?.product.title ?? check.taskId}: {check.canPublish ? "OK" : check.issues.map((issue) => issue.message).join(" / ")}
                    </span>
                  )
                })}
              </div>
            </div>
          ) : null}
          <div className="queue-list">
            {tasks.map((task) => (
              <button key={task.id} className={`queue-item ${task.id === activeTask?.id ? "active" : ""}`} onClick={() => setActiveTaskId(task.id)}>
                <div className="queue-item-top">
                  <input
                    type="checkbox"
                    checked={selectedTaskIds.includes(task.id)}
                    onChange={() => toggleTaskSelection(task.id)}
                    onClick={(event) => event.stopPropagation()}
                  />
                  <strong>{task.product.title}</strong>
                </div>
                <span>{task.product.category}</span>
                <span>{statusLabel[task.status]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="queue-panel">
          <div className="queue-head">
            <strong>Dianxiaomi edit queue</strong>
            <p>{dianxiaomiProductWorkItems.length} Dianxiaomi products waiting for requirement-based edits.</p>
          </div>
          <div className="collected-product-list">
            {dianxiaomiProductWorkItems.length > 0 ? dianxiaomiProductWorkItems.slice(0, 6).map((item) => (
              <div key={item.id} className="collected-product-item">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.pageProfile ?? "Dianxiaomi product"} / {item.status}</span>
                  <small>{new Date(item.updatedAt).toLocaleString()} / required {item.requirements.summary.requiredPassed}/{item.requirements.summary.requiredTotal} / SKU {item.snapshot.skuCount} / images {item.snapshot.imageCount}</small>
                  {item.suggestedEdits.length > 0 ? (
                    <small>{item.suggestedEdits.slice(0, 3).map((edit) => `${edit.field}: ${edit.suggestedValue || edit.reason}`).join(" / ")}</small>
                  ) : null}
                </div>
                <div className="task-export-actions">
                  <button
                    className="ghost-button small-button"
                    onClick={() => window.open(item.pageUrl, "_blank", "noopener,noreferrer")}
                  >
                    open
                  </button>
                  <button
                    className="ghost-button small-button"
                    onClick={() => void dianxiaomiWorkItemTaskCreator.mutateAsync(item.id)}
                    disabled={dianxiaomiWorkItemTaskCreator.isPending}
                  >
                    create edit task
                  </button>
                </div>
              </div>
            )) : (
              <div className="empty-report">Open a Dianxiaomi collected/product edit page and click the extension button to add it here.</div>
            )}
          </div>
        </div>

        {dianxiaomiRequirementRulesDraft ? (
          <div className="queue-panel">
            <div className="queue-head">
              <strong>Dianxiaomi listing rules</strong>
              <p>Save recalculates all queued Dianxiaomi items.</p>
            </div>
            <div className="pricing-form dianxiaomi-rules-form">
              <label>Preset name<input value={dianxiaomiRequirementRulesDraft.presetName} onChange={(event) => setDianxiaomiRequirementPresetName(event.target.value)} /></label>
              <label className="rule-toggle">Title required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.title.required} onChange={(event) => setDianxiaomiRequirementRequired("title", event.target.checked)} /></label>
              <label>Title min length<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.title.minLength} onChange={(event) => setDianxiaomiRequirementNumber("title", "minLength", event.target.value)} /></label>
              <label>Title max length<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.title.maxLength} onChange={(event) => setDianxiaomiRequirementNumber("title", "maxLength", event.target.value)} /></label>
              <label className="rule-toggle">Images required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.images.required} onChange={(event) => setDianxiaomiRequirementRequired("images", event.target.checked)} /></label>
              <label>Minimum images<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.images.minCount} onChange={(event) => setDianxiaomiRequirementNumber("images", "minCount", event.target.value)} /></label>
              <label className="rule-toggle">Media rules required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.media.required} onChange={(event) => setDianxiaomiRequirementRequired("media", event.target.checked)} /></label>
              <label className="rule-toggle">Use image translation<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.media.requireImageTranslation} onChange={(event) => setDianxiaomiMediaBoolean("requireImageTranslation", event.target.checked)} /></label>
              <label>Image translation language<input value={dianxiaomiRequirementRulesDraft.media.targetLanguage} onChange={(event) => setDianxiaomiMediaText("targetLanguage", event.target.value)} /></label>
              <label className="rule-toggle">Normalize image size<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.media.requireSizeNormalization} onChange={(event) => setDianxiaomiMediaBoolean("requireSizeNormalization", event.target.checked)} /></label>
              <label>Minimum image width<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.media.minWidthPx} onChange={(event) => setDianxiaomiRequirementNumber("media", "minWidthPx", event.target.value)} /></label>
              <label>Minimum image height<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.media.minHeightPx} onChange={(event) => setDianxiaomiRequirementNumber("media", "minHeightPx", event.target.value)} /></label>
              <label>Maximum image width<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.media.maxWidthPx} onChange={(event) => setDianxiaomiRequirementNumber("media", "maxWidthPx", event.target.value)} /></label>
              <label>Maximum image height<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.media.maxHeightPx} onChange={(event) => setDianxiaomiRequirementNumber("media", "maxHeightPx", event.target.value)} /></label>
              <label>Maximum image size MB<input type="number" step="0.1" value={dianxiaomiRequirementRulesDraft.media.maxSizeMb} onChange={(event) => setDianxiaomiRequirementNumber("media", "maxSizeMb", event.target.value)} /></label>
              <label className="rule-toggle">Require white background<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.media.requireWhiteBackground} onChange={(event) => setDianxiaomiMediaBoolean("requireWhiteBackground", event.target.checked)} /></label>
              <label className="rule-toggle">Image editor review<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.media.requireImageEditorReview} onChange={(event) => setDianxiaomiMediaBoolean("requireImageEditorReview", event.target.checked)} /></label>
              <label>Dianxiaomi media tools<textarea className="compact-textarea" value={dianxiaomiMediaToolsText} onChange={(event) => setDianxiaomiMediaToolsText(event.target.value)} /></label>
              <label className="rule-toggle">SKU required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.sku.required} onChange={(event) => setDianxiaomiRequirementRequired("sku", event.target.checked)} /></label>
              <label>Minimum SKU rows<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.sku.minCount} onChange={(event) => setDianxiaomiRequirementNumber("sku", "minCount", event.target.value)} /></label>
              <label className="rule-toggle">Price required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.price.required} onChange={(event) => setDianxiaomiRequirementRequired("price", event.target.checked)} /></label>
              <label>Minimum price fields<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.price.minEditableFieldCount} onChange={(event) => setDianxiaomiRequirementNumber("price", "minEditableFieldCount", event.target.value)} /></label>
              <label className="rule-toggle">Stock required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.stock.required} onChange={(event) => setDianxiaomiRequirementRequired("stock", event.target.checked)} /></label>
              <label>Minimum stock fields<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.stock.minEditableFieldCount} onChange={(event) => setDianxiaomiRequirementNumber("stock", "minEditableFieldCount", event.target.value)} /></label>
              <label className="rule-toggle">Attributes required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.attributes.required} onChange={(event) => setDianxiaomiRequirementRequired("attributes", event.target.checked)} /></label>
              <label>Minimum attributes<input type="number" step="1" value={dianxiaomiRequirementRulesDraft.attributes.minCount} onChange={(event) => setDianxiaomiRequirementNumber("attributes", "minCount", event.target.value)} /></label>
              <label>Recommended attribute keys<textarea className="compact-textarea" value={dianxiaomiRecommendedKeysText} onChange={(event) => setDianxiaomiRecommendedKeysText(event.target.value)} /></label>
              <label className="rule-toggle">Compliance required<input type="checkbox" checked={dianxiaomiRequirementRulesDraft.compliance.required} onChange={(event) => setDianxiaomiRequirementRequired("compliance", event.target.checked)} /></label>
              <label>Blocked compliance terms<textarea className="compact-textarea" value={dianxiaomiBlockedTermsText} onChange={(event) => setDianxiaomiBlockedTermsText(event.target.value)} /></label>
            </div>
            <button className="primary-button import-button" onClick={() => {
              const input = buildDianxiaomiRequirementRulesPayload()
              if (input) void dianxiaomiRequirementRulesUpdater.mutateAsync(input)
            }} disabled={dianxiaomiRequirementRulesUpdater.isPending || !dianxiaomiRequirementRulesDraft.presetName.trim()}>
              {dianxiaomiRequirementRulesUpdater.isPending ? "saving..." : "Save listing rules"}
            </button>
          </div>
        ) : null}

        <div className="queue-panel">
          <div className="queue-head">
            <strong>店小秘采集</strong>
            <p>{dianxiaomiCollectedProducts.length} 个来自浏览器插件的采集商品。</p>
          </div>
          <div className="collected-product-list">
            {dianxiaomiCollectedProducts.length > 0 ? dianxiaomiCollectedProducts.slice(0, 6).map((product) => (
              <div key={product.id} className="collected-product-item">
                <div>
                  <strong>{product.title}</strong>
                  <span>{product.category}</span>
                  <small>{new Date(product.collectedAt).toLocaleString()} / {product.quality.status} {product.quality.score}% / SKU {product.skus.length} / images {product.images.length}</small>
                  {product.quality.checks.some((check) => !check.ok) ? (
                    <small>{product.quality.checks.filter((check) => !check.ok).map((check) => check.message).join(" / ")}</small>
                  ) : null}
                </div>
                <button
                  className="ghost-button small-button"
                  onClick={() => void dianxiaomiCollectedTaskCreator.mutateAsync(product.id)}
                  disabled={dianxiaomiCollectedTaskCreator.isPending}
                >
                  生成任务
                </button>
              </div>
            )) : (
              <div className="empty-report">暂无店小秘采集商品，在插件面板点击“采集商品”。</div>
            )}
          </div>
        </div>

        <div className="queue-panel">
          <div className="queue-head">
            <strong>手动录入</strong>
            <p>临时录入一个商品，可填写多 SKU。</p>
          </div>
          <div className="pricing-form">
            <label>商品标题<input value={manualProduct.title} onChange={(event) => setManualField("title", event.target.value)} /></label>
            <label>类目<input value={manualProduct.category} onChange={(event) => setManualField("category", event.target.value)} /></label>
            <label>默认 SKU 名称<input value={manualProduct.skuName ?? ""} onChange={(event) => setManualField("skuName", event.target.value)} /></label>
            <label>成本价 CNY<input type="number" step="0.01" value={manualProduct.supplierPriceCny} onChange={(event) => setManualField("supplierPriceCny", event.target.value)} /></label>
            <label>国内运费 CNY<input type="number" step="0.01" value={manualProduct.estimatedDomesticShippingCny} onChange={(event) => setManualField("estimatedDomesticShippingCny", event.target.value)} /></label>
            <label>重量 kg<input type="number" step="0.01" value={manualProduct.estimatedWeightKg} onChange={(event) => setManualField("estimatedWeightKg", event.target.value)} /></label>
            <label>库存<input type="number" step="1" value={manualProduct.stock} onChange={(event) => setManualField("stock", event.target.value)} /></label>
            <label>来源链接<input value={manualProduct.sourceUrl ?? ""} onChange={(event) => setManualField("sourceUrl", event.target.value)} /></label>
            <label>商品属性<textarea className="compact-textarea" placeholder="颜色:灰色;材质:尼龙" value={manualAttributesText} onChange={(event) => setManualAttributesText(event.target.value)} /></label>
            <label>图片链接<textarea className="compact-textarea" placeholder="多个链接用换行、逗号或分号分隔" value={manualImagesText} onChange={(event) => setManualImagesText(event.target.value)} /></label>
            <label>SKU 列表<textarea className="compact-textarea" placeholder="SKU名,成本价,库存,属性。例如：灰色 M,12.9,100,颜色:灰色;尺码:M" value={manualSkusText} onChange={(event) => setManualSkusText(event.target.value)} /></label>
          </div>
          <button className="primary-button import-button" onClick={() => void manualCreator.mutateAsync(buildManualProductPayload())} disabled={manualCreator.isPending || !manualProduct.title || !manualProduct.category}>
            {manualCreator.isPending ? "创建中..." : "创建手动任务"}
          </button>
        </div>

        <div className="queue-panel">
          <div className="queue-head">
            <strong>CSV / Excel 导入</strong>
            <p>一行一个 SKU，同名商品会合并为一个任务。</p>
          </div>
          <a className="template-link" href={csvTemplateUrl}>下载 CSV 模板</a>
          <textarea className="csv-import-box" value={csvText} onChange={(event) => setCsvText(event.target.value)} />
          <button className="primary-button import-button" onClick={() => void csvImporter.mutateAsync(csvText)} disabled={csvImporter.isPending}>
            {csvImporter.isPending ? "导入中..." : "导入 CSV 商品"}
          </button>
          {csvImporter.data ? <ImportResult result={csvImporter.data} prefix="CSV" /> : null}
          <div className="excel-import-row">
            <input type="file" accept=".xlsx" onChange={(event) => setSelectedExcelFile(event.target.files?.[0] ?? null)} />
            <button className="ghost-button import-button" onClick={() => selectedExcelFile && void excelImporter.mutateAsync(selectedExcelFile)} disabled={!selectedExcelFile || excelImporter.isPending}>
              {excelImporter.isPending ? "上传中..." : "导入 Excel"}
            </button>
          </div>
          {excelImporter.data ? <ImportResult result={excelImporter.data} prefix="Excel" /> : null}
        </div>

        {pricingDraft ? (
          <div className="queue-panel">
            <div className="queue-head">
              <strong>核价规则</strong>
              <p>保存后会重算待执行任务价格。</p>
            </div>
            <div className="pricing-form">
              <label>汇率 CNY/USD<input type="number" step="0.01" value={pricingDraft.exchangeRateCnyPerUsd} onChange={(event) => setPricingField("exchangeRateCnyPerUsd", event.target.value)} /></label>
              <label>物流 USD/kg<input type="number" step="0.01" value={pricingDraft.logisticsUsdPerKg} onChange={(event) => setPricingField("logisticsUsdPerKg", event.target.value)} /></label>
              <label>平台费 USD<input type="number" step="0.01" value={pricingDraft.platformFeeUsd} onChange={(event) => setPricingField("platformFeeUsd", event.target.value)} /></label>
              <label>目标毛利率<input type="number" step="0.01" value={pricingDraft.targetMarginRate} onChange={(event) => setPricingField("targetMarginRate", event.target.value)} /></label>
              <label>售价倍数<input type="number" step="0.01" value={pricingDraft.priceMultiplier} onChange={(event) => setPricingField("priceMultiplier", event.target.value)} /></label>
              <label>最低毛利率<input type="number" step="0.01" value={pricingDraft.minimumMarginRate} onChange={(event) => setPricingField("minimumMarginRate", event.target.value)} /></label>
              <label>最低建议售价 USD<input type="number" step="0.01" value={pricingDraft.minimumSuggestedPriceUsd} onChange={(event) => setPricingField("minimumSuggestedPriceUsd", event.target.value)} /></label>
              <label>物流分段<textarea className="compact-textarea" placeholder="最小重量,最大重量,基础费,每kg费用。例如：0,0.25,0.35,3.6" value={logisticsTiersText} onChange={(event) => setLogisticsTiersText(event.target.value)} /></label>
            </div>
            <button className="primary-button import-button" onClick={() => {
              const input = buildPricingPayload()
              if (input) void pricingUpdater.mutateAsync(input)
            }} disabled={pricingUpdater.isPending}>
              {pricingUpdater.isPending ? "保存中..." : "保存核价规则"}
            </button>
          </div>
        ) : null}
      </aside>

      <main className="workspace">
        <div className="advanced-console-bar">
          <button className="ghost-button small-button" onClick={() => setShowAdvancedConsole(false)}>返回日常模式</button>
          <span>高级区默认隐藏；新增人工步骤必须有自动化替代计划和下线时间。</span>
        </div>
        <section className="panel advanced-recovery-panel">
          <div className="panel-head split-head">
            <div>
              <h3>故障恢复批跑</h3>
              <p className="subtle">只处理 auto-ready 且浏览器可执行的 blocked 商品；repair-* 仍只作为故障恢复工具。</p>
            </div>
            <button
              className="primary-button small-button"
              onClick={() => void automationRecoveryRunner.mutateAsync(defaultRecoveryRunInput)}
              disabled={automationRecoveryRunner.isPending || displayedBrowserRecoveryCandidateCount === 0}
            >
              {automationRecoveryRunner.isPending ? "starting recovery..." : `Run recovery (${displayedBrowserRecoveryCandidateCount})`}
            </button>
          </div>
          <div className="daily-status-strip advanced-recovery-stats">
            <DailyMetric label="released retry" value={String(releasedBrowserRecoveryCandidateCount)} detail="one item per daemon tick" tone={releasedBrowserRecoveryCandidateCount > 0 ? "warn" : "neutral"} />
            <DailyMetric label="浏览器恢复" value={String(displayedBrowserRecoveryCandidateCount)} detail="repair-preview / repair-apply / full-flow" tone={displayedBrowserRecoveryCandidateCount > 0 ? "good" : "neutral"} />
            <DailyMetric label="暂停恢复" value={String(pausedBrowserRecoveryCandidateCount)} detail="重复失败预算保护" tone={pausedBrowserRecoveryCandidateCount > 0 ? "warn" : "neutral"} />
            <DailyMetric label="直接安全重试" value={String(directSafeRetryCandidateCount)} detail="无需字段或图片修复" tone={directSafeRetryCandidateCount > 0 ? "warn" : "neutral"} />
            <DailyMetric label="失败队列" value={String(blockedWorkItems.length)} detail="不计入日常主路径 KPI" tone={blockedWorkItems.length > 0 ? "warn" : "neutral"} />
            <DailyMetric label="恢复批次" value={String(automationRecoveryRuns.length)} detail={automationRecoveryRuns[0] ? automationRecoveryRuns[0].status : "暂无恢复运行"} tone={automationRecoveryRuns[0]?.status === "failed" ? "bad" : automationRecoveryRuns[0]?.status === "completed" ? "good" : "neutral"} />
          </div>
          {automationRecoveryRunMessage ? (
            <div className="import-result">
              <p>{automationRecoveryRunMessage}</p>
            </div>
          ) : null}
          {automationRecoveryRuns.length > 0 ? (
            <div className="report-list">
              {automationRecoveryRuns.slice(0, 3).map((run) => <RecoveryRunCard key={run.id} run={run} />)}
            </div>
          ) : (
            <div className="empty-report">暂无恢复批跑记录。</div>
          )}
        </section>
        {activeTask ? (
          <>
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">当前商品</p>
                <h2>{activeTask.product.title}</h2>
                <p className="subtle">来源 {activeTask.product.source} / 类目 {activeTask.product.category}</p>
                <p className="ready-note">{readyLabel}</p>
              </div>
              <div className="hero-actions">
                <button className="ghost-button" onClick={() => void planner.mutateAsync(activeTask.product.id)} disabled={planner.isPending}>
                  {planner.isPending ? "AI 处理中..." : "AI 重新生成方案"}
                </button>
                <button className="primary-button" onClick={() => void syncer.mutateAsync(activeTask.id)} disabled={syncer.isPending || !canSyncToStore}>
                  {syncer.isPending ? "同步中..." : canSyncToStore ? "一键同步到店小秘" : "等待审核通过"}
                </button>
              </div>
            </section>

            <section className="summary-grid">
              <SummaryCard label="建议售价" value={formatMoney(activeTask.pricing.suggestedPriceUsd)} detail="按当前核价规则计算" />
              <SummaryCard label="保本底价" value={formatMoney(activeTask.pricing.floorPriceUsd)} detail="采购、物流、平台费合计" />
              <SummaryCard label="任务状态" value={statusLabel[activeTask.status]} detail="由任务和自动化报告回写" />
              <SummaryCard label="执行进度" value={`${progress}%`} detail="根据任务步骤完成情况计算" />
            </section>

            <section className="main-grid">
              <article className="panel">
                <div className="panel-head"><h3>AI 上品方案</h3></div>
                <InfoBlock label="发布标题">{activeTask.draft.listingTitle}</InfoBlock>
                <InfoBlock label="核心卖点">
                  <div className="tag-list">{activeTask.draft.sellingPoints.map((point) => <span key={point} className="tag-chip">{point}</span>)}</div>
                </InfoBlock>
                <InfoBlock label="商品描述">{activeTask.draft.description}</InfoBlock>
                <InfoBlock label="SKU 定价">
                  <div className="sku-list">
                    {activeTask.draft.skuPricing.map((sku) => (
                      <div key={sku.skuId} className="sku-item">
                        <strong>{sku.skuName}</strong>
                        <span>{sku.attributeSummary}</span>
                        <span>{formatMoney(sku.salePriceUsd)} / 库存 {sku.stock}</span>
                      </div>
                    ))}
                  </div>
                </InfoBlock>
              </article>

              <article className="panel">
                <div className="panel-head"><h3>草稿编辑</h3></div>
                {listingEditDraft ? (
                  <>
                    <div className="pricing-form">
                      <label>发布标题<input value={listingEditDraft.listingTitle} onChange={(event) => setListingEditField("listingTitle", event.target.value)} /></label>
                      <label>核心卖点<textarea className="compact-textarea" value={listingEditDraft.sellingPointsText} onChange={(event) => setListingEditField("sellingPointsText", event.target.value)} /></label>
                      <label>商品描述<textarea className="compact-textarea tall-textarea" value={listingEditDraft.description} onChange={(event) => setListingEditField("description", event.target.value)} /></label>
                      <label>类目路径<textarea className="compact-textarea" value={listingEditDraft.categoryPathText} onChange={(event) => setListingEditField("categoryPathText", event.target.value)} /></label>
                      <label>草稿属性<textarea className="compact-textarea" value={listingEditDraft.attributesText} onChange={(event) => setListingEditField("attributesText", event.target.value)} /></label>
                      <label>SKU 售价<textarea className="compact-textarea tall-textarea" placeholder="skuId,SKU名,售价USD,库存,属性" value={listingEditDraft.skuPricingText} onChange={(event) => setListingEditField("skuPricingText", event.target.value)} /></label>
                    </div>
                    <button className="primary-button import-button" onClick={() => {
                      const input = buildDraftUpdatePayload()
                      if (input) void draftUpdater.mutateAsync({ taskId: activeTask.id, input })
                    }} disabled={draftUpdater.isPending || !listingEditDraft.listingTitle}>
                      {draftUpdater.isPending ? "保存中..." : "保存草稿内容"}
                    </button>
                    <div className="draft-history">
                      <strong>草稿版本</strong>
                      {(activeTask.draftVersions ?? []).length > 0 ? (
                        <div className="draft-version-list">
                          {(activeTask.draftVersions ?? []).slice(0, 8).map((version) => (
                            <div key={version.id} className="draft-version-item">
                              <div>
                                <span>{version.label}</span>
                                <small>{version.source} / {new Date(version.createdAt).toLocaleString()}</small>
                              </div>
                              <button
                                className="ghost-button small-button"
                                onClick={() => void draftRestorer.mutateAsync({ taskId: activeTask.id, versionId: version.id })}
                                disabled={draftRestorer.isPending}
                              >
                                恢复
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : <div className="empty-report">暂无草稿版本</div>}
                    </div>
                  </>
                ) : null}
              </article>
            </section>

            <section className="main-grid">
              <article className="panel">
                <div className="panel-head"><h3>商品编辑</h3></div>
                {productEditDraft ? (
                  <>
                    <div className="pricing-form two-col-form">
                      <label>商品标题<input value={productEditDraft.title} onChange={(event) => setProductEditField("title", event.target.value)} /></label>
                      <label>类目<input value={productEditDraft.category} onChange={(event) => setProductEditField("category", event.target.value)} /></label>
                      <label>成本价 CNY<input type="number" step="0.01" value={productEditDraft.supplierPriceCny} onChange={(event) => setProductEditField("supplierPriceCny", event.target.value)} /></label>
                      <label>国内运费 CNY<input type="number" step="0.01" value={productEditDraft.estimatedDomesticShippingCny} onChange={(event) => setProductEditField("estimatedDomesticShippingCny", event.target.value)} /></label>
                      <label>重量 kg<input type="number" step="0.01" value={productEditDraft.estimatedWeightKg} onChange={(event) => setProductEditField("estimatedWeightKg", event.target.value)} /></label>
                      <label>总库存<input type="number" step="1" value={productEditDraft.stock} onChange={(event) => setProductEditField("stock", event.target.value)} /></label>
                      <label className="wide-field">来源链接<input value={productEditDraft.sourceUrl} onChange={(event) => setProductEditField("sourceUrl", event.target.value)} /></label>
                      <label className="wide-field">商品属性<textarea className="compact-textarea" value={productEditDraft.attributesText} onChange={(event) => setProductEditField("attributesText", event.target.value)} /></label>
                      <label className="wide-field">图片链接<textarea className="compact-textarea" value={productEditDraft.imagesText} onChange={(event) => setProductEditField("imagesText", event.target.value)} /></label>
                      <label className="wide-field">SKU 列表<textarea className="compact-textarea tall-textarea" value={productEditDraft.skusText} onChange={(event) => setProductEditField("skusText", event.target.value)} /></label>
                    </div>
                    <button className="primary-button import-button" onClick={() => {
                      const input = buildProductUpdatePayload()
                      if (input) void productUpdater.mutateAsync({ taskId: activeTask.id, input })
                    }} disabled={productUpdater.isPending || !productEditDraft.title || !productEditDraft.category}>
                      {productUpdater.isPending ? "保存中..." : "保存并重建方案"}
                    </button>
                  </>
                ) : null}
              </article>

              <article className="panel">
                <div className="panel-head"><h3>审核工作台</h3></div>
                <div className="review-history">
                  <strong>鍙戝竷鍓嶆鏌?</strong>
                  {publishCheck ? (
                    <>
                      <div className={`review-state ${publishCheck.canPublish ? "approved" : "rejected"}`}>
                        <strong>{publishCheck.canPublish ? "可以发布" : "存在问题"}</strong>
                        <span>{new Date(publishCheck.checkedAt).toLocaleString()}</span>
                      </div>
                      <div className="risk-list-simple">
                        {publishCheck.issues.length > 0
                          ? publishCheck.issues.map((issue) => (
                              <div key={issue.id} className={`risk-pill ${issue.level}`}>
                                {issue.message}
                              </div>
                            ))
                          : <div className="empty-report">暂无问题，可以提交上架</div>}
                      </div>
                    </>
                  ) : (
                    <div className="empty-report">姝ｅ湪鏌ョ湅鍙戝竷鍓嶇姸鎬?</div>
                  )}
                </div>
                <div className="review-box">
                  <div className={`review-state ${activeTask.review?.status ?? "pending"}`}>
                    <strong>{reviewStatusLabel[activeTask.review?.status ?? "pending"]}</strong>
                    <span>{activeTask.review?.note || "暂无审核备注"}</span>
                  </div>
                  <textarea
                    className="compact-textarea"
                    placeholder="填写审核备注、修改要求或驳回原因"
                    value={reviewNote}
                    onChange={(event) => setReviewNote(event.target.value)}
                  />
                  <div className="review-actions">
                    <button className="primary-button" onClick={() => void reviewer.mutateAsync({ taskId: activeTask.id, decision: "approve", note: reviewNote })} disabled={reviewer.isPending}>
                      审核通过
                    </button>
                    <button className="ghost-button" onClick={() => void reviewer.mutateAsync({ taskId: activeTask.id, decision: "request_changes", note: reviewNote })} disabled={reviewer.isPending}>
                      退回修改
                    </button>
                    <button className="ghost-button danger-button" onClick={() => void reviewer.mutateAsync({ taskId: activeTask.id, decision: "reject", note: reviewNote })} disabled={reviewer.isPending}>
                      驳回
                    </button>
                  </div>
                  <div className="review-history">
                    {(activeTask.review?.history ?? []).length > 0 ? activeTask.review?.history.map((event) => (
                      <div key={`${event.createdAt}-${event.decision}`} className="review-history-item">
                        <strong>{reviewDecisionLabel[event.decision]}</strong>
                        <span>{event.note || "无备注"}</span>
                        <small>{new Date(event.createdAt).toLocaleString()}</small>
                      </div>
                    )) : <div className="empty-report">暂无审核记录</div>}
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-head"><h3>执行步骤</h3></div>
                <div className="flow-list">
                  {activeTask.steps.map((step) => (
                    <div key={step.id} className={`flow-item step-${step.status}`}>
                      <strong>{step.title}</strong>
                      <p>{step.instruction}</p>
                      <span>{step.status}</span>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="bottom-grid">
              <article className="panel">
                <div className="panel-head"><h3>核价说明</h3></div>
                <div className="explain-list">{activeTask.pricing.rationale.map((item) => <div key={item} className="explain-item">{item}</div>)}</div>
              </article>
              <article className="panel">
                <div className="panel-head"><h3>风险提醒</h3></div>
                <div className="risk-list-simple">
                  {activeTask.risks.length > 0
                    ? activeTask.risks.map((risk) => <div key={risk.id} className={`risk-pill ${risk.level}`}>{risk.message}</div>)
                    : <div className="empty-report">暂无风险提醒</div>}
                </div>
              </article>
            </section>

            <section className="panel">
              <div className="panel-head split-head">
                <h3>最近自动化报告</h3>
                <span className="report-count">{automationReports.length} 条</span>
              </div>
              <div className="automation-launch-form">
                <label>
                  <span>Preset</span>
                  <select
                    value={selectedAutomationPresetId}
                    onChange={(event) => {
                      const preset = automationLaunchPresets.find((item) => item.id === event.target.value)
                      setSelectedAutomationPresetId(event.target.value)
                      if (preset) {
                        setAutomationPresetName(preset.name)
                        setAutomationLaunchDraft(automationDraftFromInput(preset.input))
                      }
                    }}
                  >
                    <option value="">new preset</option>
                    {automationLaunchPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Preset name</span>
                  <input
                    value={automationPresetName}
                    onChange={(event) => setAutomationPresetName(event.target.value)}
                    placeholder="Dianxiaomi draft flow"
                  />
                </label>
                <label>
                  <span>Target URL</span>
                  <input
                    value={automationLaunchDraft.url}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      url: event.target.value
                    }))}
                    placeholder="default Dianxiaomi URL"
                  />
                </label>
                <label>
                  <span>Task file</span>
                  <input
                    value={automationLaunchDraft.taskFile}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      taskFile: event.target.value
                    }))}
                    placeholder=".runtime/task.json"
                  />
                </label>
                <label>
                  <span>Selector config</span>
                  <input
                    value={automationLaunchDraft.selectorConfig}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      selectorConfig: event.target.value
                    }))}
                    placeholder=".runtime/dianxiaomi-selector-config.json"
                  />
                </label>
                <label>
                  <span>Profile</span>
                  <input
                    value={automationLaunchDraft.profile}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      profile: event.target.value
                    }))}
                    placeholder=".runtime/playwright/dianxiaomi-profile"
                  />
                </label>
                <label>
                  <span>Screenshots</span>
                  <input
                    value={automationLaunchDraft.screenshots}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      screenshots: event.target.value
                    }))}
                    placeholder="output/playwright"
                  />
                </label>
                <label>
                  <span>Media automation</span>
                  <select
                    value={automationLaunchDraft.mediaAutomationMode}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      mediaAutomationMode: event.target.value
                    }))}
                  >
                    <option value="plan-only">plan-only</option>
                    <option value="unattended-open">unattended-open</option>
                    <option value="unattended-apply">unattended-apply</option>
                  </select>
                </label>
                <label>
                  <span>Media tools</span>
                  <textarea
                    className="compact-textarea"
                    value={automationLaunchDraft.mediaAutomationTools}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      mediaAutomationTools: event.target.value
                    }))}
                    placeholder="image-translation&#10;batch-resize&#10;white-background"
                  />
                </label>
                <label className="automation-toggle">
                  <input
                    type="checkbox"
                    checked={automationLaunchDraft.headed}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      headed: event.target.checked
                    }))}
                  />
                  <span>Headed browser</span>
                </label>
                <label className="automation-toggle">
                  <input
                    type="checkbox"
                    checked={automationLaunchDraft.submitAfterSave}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      submitAfterSave: event.target.checked
                    }))}
                  />
                  <span>Submit after save</span>
                </label>
                <label>
                  <span>Submit attempts</span>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={automationLaunchDraft.submitMaxAttempts}
                    onChange={(event) => setAutomationLaunchDraft((current) => ({
                      ...current,
                      submitMaxAttempts: event.target.value
                    }))}
                  />
                </label>
                <button
                  className="ghost-button small-button"
                  onClick={() => setAutomationLaunchDraft(defaultAutomationLaunchDraft)}
                >
                  reset params
                </button>
                <button
                  className="ghost-button small-button"
                  onClick={() => activeTask && void automationTaskFileExporter.mutateAsync({
                    taskId: activeTask.id,
                    input: {}
                  })}
                  disabled={!activeTask || automationTaskFileExporter.isPending}
                >
                  {automationTaskFileExporter.isPending ? "exporting task..." : "export active task"}
                </button>
                <button
                  className="ghost-button small-button"
                  onClick={() => {
                    setSelectedAutomationPresetId("")
                    setAutomationPresetName("")
                    setAutomationLaunchDraft(defaultAutomationLaunchDraft)
                  }}
                >
                  new preset
                </button>
                <button
                  className="primary-button small-button"
                  onClick={() => {
                    const name = automationPresetName.trim() || selectedAutomationPreset?.name || "Automation preset"
                    if (selectedAutomationPresetId) {
                      void automationPresetUpdater.mutateAsync({
                        id: selectedAutomationPresetId,
                        input: {
                          name,
                          input: automationStartInput
                        }
                      })
                    } else {
                      void automationPresetCreator.mutateAsync({
                        name,
                        input: automationStartInput
                      })
                    }
                  }}
                  disabled={automationPresetCreator.isPending || automationPresetUpdater.isPending}
                >
                  {selectedAutomationPresetId ? "update preset" : "save preset"}
                </button>
                <button
                  className="ghost-button danger-button small-button"
                  onClick={() => void automationPresetDeleter.mutateAsync(selectedAutomationPresetId)}
                  disabled={!selectedAutomationPresetId || automationPresetDeleter.isPending}
                >
                  delete preset
                </button>
              </div>
              {automationPresetMessage ? (
                <div className="import-result">
                  <p>{automationPresetMessage}</p>
                </div>
              ) : null}
              {automationTaskFileMessage ? (
                <div className="import-result">
                  <p>{automationTaskFileMessage}</p>
                </div>
              ) : null}
              {automationTaskFileExports.length > 0 ? (
                <div className="task-export-list">
                  <label className="task-export-filter">
                    <input
                      type="checkbox"
                      checked={showBlockedTaskFiles}
                      onChange={(event) => setShowBlockedTaskFiles(event.target.checked)}
                    />
                    <span>show blocked task files ({blockedTaskFileExportCount})</span>
                  </label>
                  {visibleTaskFileExports.map((item) => (
                    <div key={item.exportId} className={`task-export-item ${taskFileLaunchClass(item)}`}>
                      <div>
                        <div className="task-export-title">
                          <strong>{item.taskId}</strong>
                          <span className={`task-export-status ${taskFileLaunchClass(item)}`}>{item.launchStatus.status}</span>
                        </div>
                        <span>{item.taskFile}</span>
                        <small>{new Date(item.exportedAt).toLocaleString()} / {item.taskStatus} / {item.bytes} bytes / {item.sha256.slice(0, 12)}</small>
                        <small>{item.launchStatus.reason}</small>
                        {item.launchStatus.dianxiaomiUrlChecks.length > 0 ? (
                          <small>{item.launchStatus.dianxiaomiUrlChecks.map((check) => `${check.label}: ${check.valid ? "valid" : check.reason ?? "invalid"}`).join(" / ")}</small>
                        ) : null}
                      </div>
                      <div className="task-export-actions">
                        <button
                          className="ghost-button small-button"
                          onClick={() => {
                            setSelectedTaskFileExportId(item.exportId)
                          }}
                        >
                          compare
                        </button>
                        <button
                          className="ghost-button small-button"
                          onClick={() => void automationTaskFileExporter.mutateAsync({
                            taskId: item.taskId,
                            input: {
                              outputPath: item.taskFile
                            }
                          })}
                          disabled={automationTaskFileExporter.isPending}
                        >
                          refresh
                        </button>
                        <button
                          className="ghost-button small-button"
                          onClick={() => setAutomationLaunchDraft((current) => ({
                            ...current,
                            taskFile: item.taskFile
                          }))}
                          disabled={item.launchStatus.status === "blocked"}
                        >
                          load
                        </button>
                      </div>
                    </div>
                  ))}
                  {visibleTaskFileExports.length === 0 ? (
                    <div className="task-export-empty">No launchable task files. Export a current real Dianxiaomi task or enable blocked files for diagnosis.</div>
                  ) : null}
                </div>
              ) : null}
              {selectedTaskFileExportDiff ? (
                <TaskSnapshotDiffPreview
                  diff={selectedTaskFileExportDiff}
                  maxEntries={6}
                  isRepairing={automationTaskFileExporter.isPending}
                  onRepair={() => void automationTaskFileExporter.mutateAsync({
                    taskId: selectedTaskFileExportDiff.currentTask.id,
                    input: {
                      outputPath: selectedTaskFileExportDiff.export.taskFile
                    }
                  })}
                />
              ) : null}
              {automationPreflight ? (
                <AutomationRunConfirmation
                  report={automationPreflight}
                  writeModeConfirmed={writeModeConfirmed}
                  setWriteModeConfirmed={setWriteModeConfirmed}
                />
              ) : null}
              <button
                className="ghost-button small-button"
                onClick={() => void automationDryRunner.mutateAsync(automationStartInput)}
                disabled={automationDryRunner.isPending}
              >
                {automationDryRunner.isPending ? "starting dry-run..." : "Start dry-run"}
              </button>
              <button
                className="primary-button small-button"
                onClick={() => void automationFullFlowRunner.mutateAsync({
                  ...automationStartInput,
                  mediaAutomationMode: automationStartInput.mediaAutomationMode ?? "unattended-apply"
                })}
                disabled={automationFullFlowRunner.isPending}
              >
                {automationFullFlowRunner.isPending ? "starting full flow..." : "Start full flow"}
              </button>
              <button
                className="primary-button small-button"
                onClick={() => void automationQueueRunner.mutateAsync({
                  ...automationStartInput,
                  mediaAutomationMode: automationStartInput.mediaAutomationMode ?? "unattended-apply",
                  limit: 5
                })}
                disabled={automationQueueRunner.isPending}
              >
                {automationQueueRunner.isPending ? "starting queue..." : "Run ready queue"}
              </button>
              <div className="automation-launch-form">
                <label>
                  <span>Daemon interval seconds</span>
                  <input
                    type="number"
                    min="15"
                    max="86400"
                    value={automationQueueDaemonInterval}
                    onChange={(event) => setAutomationQueueDaemonInterval(event.target.value)}
                  />
                </label>
                <label>
                  <span>Max consecutive failures</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={automationQueueDaemonMaxFailures}
                    onChange={(event) => setAutomationQueueDaemonMaxFailures(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button small-button"
                  onClick={() => void automationQueueDaemonStarter.mutateAsync({
                    ...automationStartInput,
                    mediaAutomationMode: automationStartInput.mediaAutomationMode ?? "unattended-apply",
                    intervalSeconds: Number.parseInt(automationQueueDaemonInterval, 10) || 300,
                    maxConsecutiveFailures: Number.parseInt(automationQueueDaemonMaxFailures, 10) || 3,
                    limit: 5
                  })}
                  disabled={automationQueueDaemonStarter.isPending}
                >
                  {automationQueueDaemonStarter.isPending ? "starting daemon..." : "Start queue daemon"}
                </button>
                <button
                  className="ghost-button small-button"
                  onClick={() => void automationQueueDaemonPauser.mutateAsync()}
                  disabled={automationQueueDaemonPauser.isPending || automationQueueDaemon?.status !== "ACTIVE"}
                >
                  {automationQueueDaemonPauser.isPending ? "pausing daemon..." : "Pause daemon"}
                </button>
                <button
                  className="ghost-button small-button"
                  onClick={() => void automationQueueDaemonTicker.mutateAsync()}
                  disabled={automationQueueDaemonTicker.isPending || automationQueueDaemon?.status !== "ACTIVE"}
                >
                  {automationQueueDaemonTicker.isPending ? "running tick..." : "Run daemon tick"}
                </button>
              </div>
              <button
                className="ghost-button small-button"
                onClick={() => void automationFillDraftRunner.mutateAsync(automationStartInput)}
                disabled={automationFillDraftRunner.isPending || !canStartFillDraft}
              >
                {automationFillDraftRunner.isPending ? "starting fill draft..." : writeModeConfirmed ? "Start fill draft" : "Confirm to fill"}
              </button>
              <button
                className="ghost-button small-button"
                onClick={() => void automationSaveDraftRunner.mutateAsync(automationStartInput)}
                disabled={automationSaveDraftRunner.isPending || !canStartSaveDraft}
              >
                {automationSaveDraftRunner.isPending ? "starting save draft..." : writeModeConfirmed ? "Start save draft" : "Confirm to save"}
              </button>
              <button
                className="ghost-button small-button"
                onClick={() => void automationSubmitListingRunner.mutateAsync(automationStartInput)}
                disabled={automationSubmitListingRunner.isPending || !canStartSubmitListing}
              >
                {automationSubmitListingRunner.isPending ? "starting submit..." : writeModeConfirmed ? "Start submit listing" : "Confirm to submit"}
              </button>
              {automationReadiness ? (
                <div className="automation-gate-grid">
                  {automationGateItems.map((item) => (
                    <div key={item.label} className={`automation-gate ${item.readiness?.ready ? "ready" : "blocked"}`}>
                      <strong>{item.label}</strong>
                      <span>{item.readiness?.ready ? "ready" : "blocked"}</span>
                      <p>{item.readiness?.reason ?? "readiness loading"}</p>
                      {item.readiness?.selectorValidation ? (
                        <div className="automation-gate-issues">
                          <span>{item.readiness.selectorValidation.valid ? "selectors valid" : "selectors blocked"}</span>
                          {item.readiness.selectorBlockers?.map((issue) => (
                            <p key={issue.id}>{issue.level}: {issue.message}</p>
                          ))}
                          {item.readiness.selectorValidation.issues
                            .filter((issue) => issue.level !== "error")
                            .slice(0, 2)
                            .map((issue) => (
                              <p key={issue.id}>{issue.level}: {issue.message}</p>
                            ))}
                        </div>
                      ) : null}
                      {item.readiness?.runningJobId ? <span>running {item.readiness.runningJobId}</span> : null}
                      {item.readiness?.targetFingerprint ? <code>{item.readiness.targetFingerprint.slice(0, 12)}</code> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {automationPreflight ? <AutomationPreflightCard report={automationPreflight} /> : null}
              {automationUnattendedStartupCheck ? <UnattendedStartupCheckCard check={automationUnattendedStartupCheck} /> : null}
              {automationDryRunMessage ? (
                <div className="import-result">
                  <p>{automationDryRunMessage}</p>
                </div>
              ) : null}
              {automationFullFlowMessage ? (
                <div className="import-result">
                  <p>{automationFullFlowMessage}</p>
                </div>
              ) : null}
              {automationQueueRunMessage ? (
                <div className="import-result">
                  <p>{automationQueueRunMessage}</p>
                </div>
              ) : null}
              {automationQueueDaemonMessage ? (
                <div className="import-result">
                  <p>{automationQueueDaemonMessage}</p>
                </div>
              ) : null}
              {automationQueueDaemonHealth ? (
                <QueueDaemonHealthCard
                  health={automationQueueDaemonHealth}
                  profileLockArchiveReadiness={profileLockArchiveReadiness}
                  manualBudgetTrials={manualBudgetTrials}
                  manualBudgetTrialPending={manualBudgetTrialRunner.isPending || manualBudgetValidationRunner.isPending}
                  profileLockArchivePending={profileLockArchiver.isPending}
                  onStartManualBudgetTrial={requestManualBudgetTrial}
                  onStartNextManualBudgetValidation={requestNextManualBudgetValidation}
                  onArchiveStaleProfileLocks={() => void profileLockArchiver.mutateAsync(automationStartInput)}
                />
              ) : null}
              {automationQueueDaemon ? <QueueDaemonCard state={automationQueueDaemon} /> : null}
              {automationFillDraftMessage ? (
                <div className="import-result">
                  <p>{automationFillDraftMessage}</p>
                </div>
              ) : null}
              {automationSaveDraftMessage ? (
                <div className="import-result">
                  <p>{automationSaveDraftMessage}</p>
                </div>
              ) : null}
              {automationSubmitListingMessage ? (
                <div className="import-result">
                  <p>{automationSubmitListingMessage}</p>
                </div>
              ) : null}
              {automationDryRunJobs.length > 0 ? (
                <div className="report-list">
                  {automationDryRunJobs.slice(0, 3).map((job) => <DryRunJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              {automationFullFlowJobs.length > 0 ? (
                <div className="report-list">
                  {automationFullFlowJobs.slice(0, 3).map((job) => <FullFlowJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              {automationQueueRuns.length > 0 ? (
                <div className="report-list">
                  {automationQueueRuns.slice(0, 3).map((run) => <QueueRunCard key={run.id} run={run} />)}
                </div>
              ) : null}
              {automationFillDraftJobs.length > 0 ? (
                <div className="report-list">
                  {automationFillDraftJobs.slice(0, 3).map((job) => <FillDraftJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              {automationSaveDraftJobs.length > 0 ? (
                <div className="report-list">
                  {automationSaveDraftJobs.slice(0, 3).map((job) => <SaveDraftJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              {automationSubmitListingJobs.length > 0 ? (
                <div className="report-list">
                  {automationSubmitListingJobs.slice(0, 3).map((job) => <SubmitListingJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              <div className="report-list">
                {automationReports.length > 0 ? automationReports.slice(0, 6).map((report) => {
                  const failedSteps = report.steps.filter((step) => step.status === "failed")
                  const doneCount = report.steps.filter((step) => step.status === "done").length
                  const targetSurfaceStep = report.steps.find((step) => step.id === "target-surface")
                  return (
                    <div key={report.id} className={`automation-report ${report.status}`}>
                      <div className="report-main">
                        <strong>{report.taskTitle}</strong>
                        <span>{new Date(report.createdAt).toLocaleString()}</span>
                        <span>{report.platform} / {report.status} / done {doneCount}/{report.steps.length}</span>
                      </div>
                      <div className="report-detail">
                        <span>{report.pageTitle || report.pageUrl}</span>
                        <span>{report.screenshotPath}</span>
                        <TargetSurfaceSummary step={targetSurfaceStep} />
                        {failedSteps.length > 0 ? <div className="failed-steps">{failedSteps.map((step) => <span key={step.id}>{step.label}: {step.detail}</span>)}</div> : null}
                      </div>
                    </div>
                  )
                }) : <div className="empty-report">暂无自动化执行报告</div>}
              </div>
            </section>

            <section className="panel">
              <div className="panel-head split-head">
                <h3>店小秘选择器诊断</h3>
                <div className="review-actions">
                  <button
                    className="ghost-button small-button"
                    onClick={() => void selectorCalibrationRunner.mutateAsync({ headed: true })}
                    disabled={selectorCalibrationRunner.isPending}
                  >
                    {selectorCalibrationRunner.isPending ? "starting calibration..." : "启动页面校准"}
                  </button>
                  <button
                    className="ghost-button small-button"
                    onClick={() => void selectorConfigGenerator.mutateAsync()}
                    disabled={selectorConfigGenerator.isPending || selectorDiagnoses.length === 0}
                  >
                    生成选择器配置
                  </button>
                </div>
              </div>
              {selectorCalibrationMessage ? (
                <div className="import-result">
                  <p>{selectorCalibrationMessage}</p>
                </div>
              ) : null}
              {selectorConfigMessage ? (
                <div className="import-result">
                  <p>{selectorConfigMessage}</p>
                </div>
              ) : null}
              {selectorConfig ? (
                <div className="import-result">
                  <p>{selectorConfig.exists ? "当前选择器配置已启用" : "当前没有选择器配置"}</p>
                  <div className="import-warnings">
                    <span>{selectorConfig.configPath}</span>
                    <span>字段 selector：{selectorConfig.summary.fieldSelectorCount}</span>
                    <span>按钮 selector：{selectorConfig.summary.buttonSelectorCount}</span>
                    <span>图片工具 selector：{selectorConfig.summary.mediaToolSelectorCount ?? 0}</span>
                    <span>SKU 行 selector：{selectorConfig.summary.skuRowSelectorCount}</span>
                  </div>
                </div>
              ) : null}
              {selectorWorkbench ? (
                <SelectorWorkbenchCard
                  workbench={selectorWorkbench}
                  draft={selectorConfigDraft}
                  setDraft={setSelectorConfigDraft}
                  versions={selectorConfigVersions}
                  onSave={(config, confirmDangerousChanges) => void selectorConfigSaver.mutateAsync({
                    config,
                    note: "dashboard manual selector config save",
                    confirmDangerousChanges
                  })}
                  onRestore={(id, confirmDangerousChanges) => void selectorConfigRestorer.mutateAsync({
                    id,
                    input: {
                      confirmDangerousChanges
                    }
                  })}
                  isSaving={selectorConfigSaver.isPending}
                  isRestoring={selectorConfigRestorer.isPending}
                />
              ) : null}
              {selectorCalibrationJobs.length > 0 ? (
                <div className="report-list">
                  {selectorCalibrationJobs.slice(0, 3).map((job) => <SelectorCalibrationJobCard key={job.id} job={job} />)}
                </div>
              ) : null}
              <div className="report-list">
                {selectorConfigValidation ? (
                  <div className={`automation-report ${selectorConfigValidation.valid ? "completed" : "failed"}`}>
                    <div className="report-main">
                      <strong>{selectorConfigValidation.valid ? "selector config validation passed" : "selector config needs attention"}</strong>
                      <span>{new Date(selectorConfigValidation.checkedAt).toLocaleString()}</span>
                      <span>{selectorConfigValidation.issues.length} issues</span>
                    </div>
                    <div className="report-detail">
                      {selectorConfigValidation.latestDiagnosisCreatedAt ? (
                        <span>diagnosis {new Date(selectorConfigValidation.latestDiagnosisCreatedAt).toLocaleString()}</span>
                      ) : null}
                      {selectorConfigValidation.issues.length > 0
                        ? selectorConfigValidation.issues.map((issue) => <span key={issue.id}>{issue.level}: {issue.message}</span>)
                        : <span>no validation issues</span>}
                    </div>
                  </div>
                ) : null}
                {selectorDiagnoses.length > 0 ? selectorDiagnoses.slice(0, 5).map((diagnosis) => {
                  const missingFields = Object.entries(diagnosis.fields)
                    .filter(([, result]) => !result.ok)
                    .map(([kind]) => kind)
                  const missingButtons = Object.entries(diagnosis.buttons)
                    .filter(([, result]) => !result.ok)
                    .map(([kind]) => kind)
                  return (
                    <div key={`${diagnosis.createdAt}-${diagnosis.pageUrl}`} className={`automation-report ${diagnosis.requiredOk ? "completed" : "failed"}`}>
                      <div className="report-main">
                        <strong>{diagnosis.requiredOk ? "关键字段可识别" : "需要校准选择器"}</strong>
                        <span>{new Date(diagnosis.createdAt).toLocaleString()}</span>
              <span>fields {diagnosis.summary.fieldCount} / buttons {diagnosis.summary.buttonCount} / media tools {diagnosis.summary.mediaToolCount ?? 0} / sku rows {diagnosis.summary.skuRowCount}</span>
                      </div>
                      <div className="report-detail">
                        <span>{diagnosis.pageTitle || diagnosis.pageUrl}</span>
                        {missingFields.length > 0 ? <span>缺字段：{missingFields.join(", ")}</span> : <span>字段识别正常</span>}
                        {missingButtons.length > 0 ? <span>缺按钮：{missingButtons.join(", ")}</span> : <span>按钮识别正常</span>}
                      </div>
                    </div>
                  )
                }) : <div className="empty-report">暂无选择器诊断报告</div>}
              </div>
            </section>
          </>
        ) : (
          <section className="hero-panel">
            <div className="hero-copy">
              <h2>暂无商品任务</h2>
              <p className="subtle">导入或手动录入商品后会显示任务。</p>
            </div>
          </section>
        )}
      </main>
        </>
      )}
    </div>
  )
}
