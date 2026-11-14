import { DateCalendarButton, StyledFilterSelect } from './FilterControls';
import { Fragment, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Calendar, X, Search, FileText, AlertCircle, Pencil, Trash2, Printer, Table2 } from 'lucide-react';
import { AutoGrowTextarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { PrintDocument, type PrintSection } from './PrintDocument';
import { recordClientActivity } from '@/lib/activity-log-client';
import { latestByProject, isPendingInspection, findingsSummary } from '@/lib/inspection-selection';
import { hasFourDigitYear, anniversaryMinusDays, INSPECTION_DAYS_BEFORE, formatSavedProjectCurrency } from '@/lib/project-form-validation';
import { attachmentError } from '@/lib/attachment-validation';

interface Inspection {
  id: string;
  localRoadId: string;
  localRoadName: string;
  date: string;
  conditionRating: number;
  remarks: string;
  inspector: string;
  inspectionType?: string;
  conditionRatings?: Record<string, string>;
  // @mine 2026-11-11 — remark and files per category.
  conditionRemarks?: Record<string, string>;
  conditionAttachments?: Record<string, ConditionAttachment[]>;
  attachment?: {
    name: string;
    type: string;
    dataUrl: string;
  };
  validationStatus?: string;
  isAnnualFollowUp?: boolean;
  isScheduledAnnualFollowUp?: boolean;
  isValidationInspection?: boolean;
  isPendingValidationInspection?: boolean;
  annualFollowUpYear?: number;
  projectName?: string;
  projectCategory?: string;
  projectDescription?: string;
  location?: string;
  dateStarted?: string;
  targetCompletionDate?: string;
  noOfExtensions?: string;
  actualCompletionDate?: string;
  roadNetworkId?: string;
  roadName?: string;
  components?: string;
  description?: string;
}

interface InspectionModuleProps {
  inspections: Inspection[];
  localRoadList: any[];
  onAddInspection: (inspection: Omit<Inspection, 'id'>) => Promise<boolean> | void;
  onEditInspection: (inspection: Inspection) => Promise<boolean>;
  onDeleteInspection: (id: string) => Promise<boolean>;
  currentUser: string;
  userRole?: string;
}

const inspectionFormTabs = [
  { id: 'project', label: 'Project Info' },
  { id: 'road', label: 'Road Info' },
  { id: 'inspection', label: 'Inspection Details' },
] as const;

// @mine 2026-11-11 — the Local Road Condition Assessment catalogue. The first seven
// categories and their wording are unchanged; the last four (Drainage, Solar Lights,
// Slope Protection, Retaining Wall) were added at the owner's request, with field
// condition descriptions written to match the existing engineering tone.
export type ConditionRating = 'Good' | 'Fair' | 'Poor' | 'Bad' | 'N/A';
export interface InspectionCategory {
  label: string;
  /** DB enum value in public.road_component (see supabase-data.ts). */
  key: string;
  details: Record<ConditionRating, string>;
}

const NOT_APPLICABLE = 'Not applicable – type/element not present.';

export const inspectionCategories: InspectionCategory[] = [
  {
    label: 'Concrete',
    key: 'concrete',
    details: {
      Good: 'Sound, even, and no cracks or scaling, normal speed ok at 70-80 kph.',
      Fair: 'Even with very minimal hair-line cracks and very minimal surface wearing, normal speed ok at 50-60 kph.',
      Poor: 'Slightly uneven with minor cracks (<=3mm. width) and wearing surface, joint sealant deterioration, normal speed ok at 30-40 kph.',
      Bad: 'With major cracks, shattered slabs, joint deterioration and cut/slip, can only travel very slowly, normal speed ok at 20-30 kph.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Asphalt',
    key: 'asphalt',
    details: {
      Good: 'Sound, well-shaped, even and waterproof, normal speed ok at 70-80 kph.',
      Fair: 'Even with minor patches and very minimal wearing surface but still waterproof, normal speed ok at 50-60 kph.',
      Poor: 'Very uneven and porous, with potholes and cracks (<=3mm. Width) normal speed 30-40 kph.',
      Bad: 'Very broken up, rough, with base failures, edge break, can only travel very slowly, normal speed ok at 20-30 kph.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Gravel',
    key: 'gravel',
    details: {
      Good: 'Good shape and surface, does not hold water.',
      Fair: 'Flat camber with minor potholes and holding some water.',
      Poor: 'Depressions common, drainage impeded.',
      Bad: 'Extensive ponding, water tends to flow on the road.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Earth',
    key: 'earth',
    details: {
      Good: 'Good shape and surface, does not hold water.',
      Fair: 'Flat camber with minor potholes and holding some water.',
      Poor: 'Depressions common, drainage impeded.',
      Bad: 'Extensive ponding, water tends to flow on the road, impassable when wet.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Shoulder',
    key: 'shoulder',
    details: {
      Good: 'Adequate width, even surface and well maintained.',
      Fair: 'Adequate width, slightly uneven, with few potholes, inadequate maintenance.',
      Poor: 'Inadequate width, very uneven or with many edge break and no maintenance.',
      Bad: 'No effective shoulders, very silted road edge and with plenty of vegetation.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Side Drain',
    key: 'side_drain',
    details: {
      Good: 'Road edge well above side drains, well defined side drains, sufficient depth, sufficient side slopes to drain water.',
      Fair: 'Road edge slightly level with side drains, not fully efficient side drains, water can cross the road.',
      Poor: 'Road edge slightly below ground level, no side drains or totally blocked side drains, some ponding of water.',
      Bad: 'Road edge well below ground level — road serving as a drain to surrounding areas.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Sidewalk',
    key: 'sidewalk',
    details: {
      Good: 'Sufficient width, even surface, no vegetation, not holding water.',
      Fair: 'Sufficient width, with minimal vegetation and slightly uneven.',
      Poor: 'Insufficient width, with ponding of water, insufficient maintenance.',
      Bad: 'No maintenance or no sidewalk.',
      'N/A': NOT_APPLICABLE,
    },
  },
  {
    label: 'Drainage',
    key: 'drainage',
    details: {
      Good: 'Well-aligned and lined drains with adequate capacity and free flow; no siltation, scouring or ponding; outlets discharge clear of the roadway.',
      Fair: 'Drains functional but partly silted or with minor vegetation; occasional overflow in heavy rain; slight cracking of the lining, no structural damage.',
      Poor: 'Drains heavily silted, blocked or undersized; water ponds along the carriageway and crosses the road; broken lining or missing covers.',
      Bad: 'No functional drainage or drains destroyed; the roadway itself serves as the drain; persistent flooding and erosion of the road edge.',
      'N/A': 'Not applicable – no drainage facility present.',
    },
  },
  {
    label: 'Solar Lights',
    key: 'solar_lights',
    details: {
      Good: 'All units installed on sound posts and lighting every night; panels clean, batteries holding charge, no outages observed.',
      Fair: 'Most units working; isolated dim or non-functional lights, light panel soiling or slightly tilted posts, batteries near end of life.',
      Poor: 'Several units not working or lighting intermittently; corroded wiring or controllers, damaged panels, leaning or vandalised posts.',
      Bad: 'System not functioning; missing or destroyed luminaires, posts down, exposed wiring — a hazard to road users at night.',
      'N/A': 'Not applicable – no solar lighting along this road section.',
    },
  },
  {
    label: 'Slope Protection',
    key: 'slope_protection',
    details: {
      Good: 'Slopes stable at the designed angle, vegetation established, revetment or riprap intact — no cracking, bulging or seepage.',
      Fair: 'Minor erosion or rill formation, sparse vegetation, slight cracking or displacement of the slope cover; carriageway unaffected.',
      Poor: 'Moderate erosion, shallow slides or scouring at the toe; cracked or detached revetment, blocked slope drainage; road edge affected.',
      Bad: 'Active slide or slope failure, deep erosion or undercutting threatening the road; protection works destroyed; road partly blocked or unsafe.',
      'N/A': 'Not applicable – no slope protection works or cut/fill slope in this section.',
    },
  },
  {
    label: 'Retaining Wall',
    key: 'retaining_wall',
    details: {
      Good: 'Wall plumb and sound; no cracks, bulging or settlement; weep holes open and backfill draining freely.',
      Fair: 'Hairline cracks, staining or slight bulging; some weep holes clogged; no loss of function.',
      Poor: 'Wide or structural cracks, noticeable tilt or displacement, spalling with exposed reinforcement, blocked drainage building water pressure; repair needed.',
      Bad: 'Wall leaning, separating or partly collapsed, sections missing, embankment failing behind it, shoulder undermined — immediate intervention required.',
      'N/A': 'Not applicable – no retaining wall present.',
    },
  },
];

const conditionAssessmentLabels = inspectionCategories.map((category) => category.label);

/** One file attached underneath a category (signed URL once stored). */
export interface ConditionAttachment {
  name: string;
  type: string;
  dataUrl: string;
  storagePath?: string;
  staged?: boolean;
  stored?: boolean;
  size?: number;
}

/**
 * @mine — earliest date an inspection may carry: 29 days before the anniversary of
 * the completion date, for the follow-up year when known and otherwise the first
 * anniversary (WORKFLOW-DECISIONS Q16/Q18). Mirrors the server check in
 * src/app/api/inspections/route.ts so the form and the API agree.
 */
function earliestInspectionDate(completionDate?: string, annualYear?: number | string): string | null {
  if (!completionDate) return null;
  const requested = Number(annualYear);
  const year = Number.isInteger(requested) && requested > 0 ? requested : Number(completionDate.slice(0, 4)) + 1;
  return anniversaryMinusDays(completionDate, year, INSPECTION_DAYS_BEFORE);
}

export function InspectionModule({ inspections, localRoadList, onAddInspection, onEditInspection, onDeleteInspection, currentUser, userRole = '' }: InspectionModuleProps) {
  // @mine — Admin accounts are displayed as Head Engineer.
  const isAdminReadDeleteOnly = ['Admin', 'Head Engineer'].includes(userRole);
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [editingInspection, setEditingInspection] = useState<Inspection | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inspectionView, setInspectionView] = useState<'history' | 'overview'>('history');
  const [filterDate, setFilterDate] = useState('');
  const filterDateRef = useRef<HTMLInputElement>(null);
  const [selectedInspection, setSelectedInspection] = useState<{ inspection: Inspection; referenceId: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Inspection | null>(null);
  const [activeFormTab, setActiveFormTab] = useState<(typeof inspectionFormTabs)[number]['id']>('project');
  const formScrollRef = useRef<HTMLDivElement>(null);
  const projectSectionRef = useRef<HTMLElement>(null);
  const roadSectionRef = useRef<HTMLElement>(null);
  const inspectionSectionRef = useRef<HTMLElement>(null);
  const formSectionRefs = [projectSectionRef, roadSectionRef, inspectionSectionRef];
  const [validationNotice, setValidationNotice] = useState('');
  const [printSections, setPrintSections] = useState<PrintSection[] | null>(null);
  // @mine — task 14: "All years" or one year for the overview print.
  const [overviewPrintYear, setOverviewPrintYear] = useState('all');
  const [printAttachment, setPrintAttachment] = useState<Inspection['attachment']>();
  const [selectedInspectionAttachment, setSelectedInspectionAttachment] = useState<Inspection['attachment'] | null>(null);
  const canPrint = ['Admin', 'Head Engineer', 'Staff - Inspector'].includes(userRole);
  const [conditionRatings, setConditionRatings] = useState<Record<string, string>>({});
  // @mine 2026-11-11 — per-category remark + attachments (both optional).
  const [conditionRemarks, setConditionRemarks] = useState<Record<string, string>>({});
  const [conditionAttachments, setConditionAttachments] = useState<Record<string, ConditionAttachment[]>>({});
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [categoryNotice, setCategoryNotice] = useState('');
  const [formData, setFormData] = useState({
    localRoadId: '',
    projectName: '',
    projectCategory: '',
    projectDescription: '',
    location: '',
    dateStarted: '',
    targetCompletionDate: '',
    noOfExtensions: '',
    actualCompletionDate: '',
    roadNetworkId: '',
    roadName: '',
    components: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    inspectionType: '',
    conditionRating: 'Good',
    remarks: '',
    // @mine — the follow-up year decides which anniversary bounds the date field.
    annualFollowUpYear: undefined as number | undefined,
  });

  useEffect(() => {
    if (!showForm) return;
    formScrollRef.current?.scrollTo({ top: 0 });
  }, [showForm, editingInspection]);

  const moveToFormTab = (index: number) => {
    const scrollContainer = formScrollRef.current;
    const section = formSectionRefs[index].current;
    if (scrollContainer && section) {
      const top = section.getBoundingClientRect().top
        - scrollContainer.getBoundingClientRect().top
        + scrollContainer.scrollTop;
      scrollContainer.scrollTo({ top, behavior: 'smooth' });
    }
    setActiveFormTab(inspectionFormTabs[index].id);
  };
  const updateActiveFormTab = () => {
    const containerTop = formScrollRef.current?.getBoundingClientRect().top ?? 0;
    const currentIndex = formSectionRefs.reduce((current, sectionRef, index) => (
      sectionRef.current && sectionRef.current.getBoundingClientRect().top <= containerTop + 110 ? index : current
    ), 0);
    setActiveFormTab(inspectionFormTabs[currentIndex].id);
  };
  const returnToSection = (sectionRef: React.RefObject<HTMLElement>, tab: (typeof inspectionFormTabs)[number]['id'], selector?: string) => {
    setActiveFormTab(tab);
    const scrollContainer = formScrollRef.current;
    const section = sectionRef.current;
    if (scrollContainer && section) {
      const top = section.getBoundingClientRect().top
        - scrollContainer.getBoundingClientRect().top
        + scrollContainer.scrollTop;
      scrollContainer.scrollTo({ top, behavior: 'smooth' });
    }
    window.setTimeout(() => {
      const field = selector ? sectionRef.current?.querySelector<HTMLElement>(selector) : null;
      field?.focus();
    }, 0);
  };

  const selectedProject = localRoadList.find(item => item.id === formData.localRoadId);
  const conditionRatingOptions = ['Good', 'Fair', 'Poor', 'Bad', 'N/A'];

  const getRatingScore = (rating: number | string) => {
    const numericRating = Number(rating);
    if (Number.isFinite(numericRating)) return numericRating;
    const normalizedRating = String(rating).toLowerCase();
    if (normalizedRating === 'good') return 9;
    if (normalizedRating === 'fair') return 7;
    if (normalizedRating === 'poor') return 4;
    if (normalizedRating === 'bad') return 2;
    return 0;
  };

  const getConditionLabel = (inspection: Inspection) => {
    const rating = getRatingScore(inspection.conditionRating);
    if (rating >= 8) return 'Good';
    if (rating >= 5) return 'Fair';
    if (rating > 0) return 'Poor';
    return 'Pending Validation';
  };

  const isPendingInspectionRecord = isPendingInspection;

  // A date search can find a historical follow-up, but never shows more than
  // one card for the same project. No stored inspections are removed.
  const datedInspections = filterDate
    ? inspections.filter(inspection => !isPendingInspectionRecord(inspection) && inspection.date === filterDate)
    : inspections;
  const yearInspections = inspectionView === 'overview' && overviewPrintYear !== 'all'
    ? datedInspections.filter(inspection => !isPendingInspectionRecord(inspection) && inspection.date?.slice(0, 4) === overviewPrintYear)
    : datedInspections;
  const originalOrder = new Map(inspections.slice().reverse().map((inspection, index) => [inspection.id, index]));
  const filteredInspections = latestByProject(yearInspections)
    .slice()
    .reverse()
    .map((inspection) => ({
      inspection,
      referenceId: `INSP-${(isPendingInspectionRecord(inspection) ? inspection.annualFollowUpYear : inspection.date?.slice(0, 4)) || new Date().getFullYear()}-${String((originalOrder.get(inspection.id) ?? 0) + 1).padStart(3, '0')}`,
    }))
    .filter(({ inspection, referenceId }) => {
      const matchesFilter = !filterDate || (!isPendingInspectionRecord(inspection) && inspection.date === filterDate);
      const road = localRoadList.find((item) => item.id === inspection.localRoadId);
      const pending = isPendingInspectionRecord(inspection);
      const name = road?.projectName || road?.name || inspection.projectName || inspection.localRoadName;
      const findings = findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks || '';
      const searchableText = (inspectionView === 'overview'
        ? [name, pending ? '' : inspection.date, road?.contractedAmount != null && road.contractedAmount !== '' ? `Php ${formatSavedProjectCurrency(String(road.contractedAmount))}` : '', pending ? '' : findings]
        : [referenceId, name, pending ? '' : inspection.date, road?.projectCategory || road?.type || 'Local Road', pending ? 'Pending' : 'Completed', pending ? '' : findings || 'No observation notes recorded.', inspection.isScheduledAnnualFollowUp ? `Annual Follow-up ${inspection.annualFollowUpYear} Provide the necessary inspection details.` : ''])
        .filter(Boolean).join(' ').toLowerCase();
      return matchesFilter && searchableText.includes(searchTerm.trim().toLowerCase());
    });


  const handleConditionRatingChange = (rowLabel: string, value: string) => {
    setConditionRatings(prev => ({ ...prev, [rowLabel]: value }));
    setFormData(prev => ({ ...prev, conditionRating: value }));
    setValidationNotice('');
  };

  // @mine 2026-11-11 — per-category remark (optional; kept even when the rating is N/A).
  const handleCategoryRemarkChange = (rowLabel: string, value: string) => {
    setConditionRemarks(prev => ({ ...prev, [rowLabel]: value }));
  };

  const removeCategoryAttachment = (rowLabel: string, index: number) => {
    setConditionAttachments(prev => ({
      ...prev,
      [rowLabel]: (prev[rowLabel] ?? []).filter((_, position) => position !== index),
    }));
  };

  /** Upload files straight to Storage through a short-lived signed URL (no 10 MB JSON body). */
  const handleCategoryAttachmentChange = async (
    rowLabel: string,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setCategoryNotice('');
    for (const file of files) {
      const problem = attachmentError(file);
      if (problem) {
        setCategoryNotice(problem);
        continue;
      }
      setUploadingCategory(rowLabel);
      try {
        const response = await fetch('/api/inspections/item-attachment-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        });
        const upload = await response.json().catch(() => ({}));
        if (!response.ok || !upload.signedUrl || !upload.path) {
          throw new Error(upload.message || 'Unable to prepare the attachment.');
        }
        const body = new FormData();
        body.append('cacheControl', '3600');
        body.append('file', new Blob([file], { type: upload.type }), file.name);
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const storageResponse = await fetch(upload.signedUrl, {
          method: 'PUT',
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          body,
        });
        if (!storageResponse.ok) throw new Error(`Could not upload ${file.name}. Please try again.`);
        setConditionAttachments(prev => ({
          ...prev,
          [rowLabel]: [
            ...(prev[rowLabel] ?? []),
            { name: file.name, type: upload.type, dataUrl: '', size: file.size, storagePath: upload.path, staged: true },
          ],
        }));
      } catch (error) {
        setCategoryNotice(error instanceof Error ? error.message : 'Unable to upload the attachment.');
      } finally {
        setUploadingCategory(null);
      }
    }
  };

  const startEditingInspection = (inspection: Inspection) => {
    const road = localRoadList.find((item) => item.id === inspection.localRoadId);
    const overallRating = getConditionLabel(inspection);
    setEditingInspection(inspection);
    setConditionRatings(inspection.conditionRatings || Object.fromEntries(
      conditionAssessmentLabels.map((label) => [label, overallRating === 'Pending Validation' ? 'N/A' : overallRating]),
    ));
    // @mine 2026-11-11 — restore the per-category remark and file sets.
    setConditionRemarks(inspection.conditionRemarks || {});
    setConditionAttachments(inspection.conditionAttachments || {});
    setCategoryNotice('');
    setFormData((previous) => ({
      ...previous,
      localRoadId: inspection.localRoadId,
      projectName: road?.projectName || road?.name || inspection.projectName || inspection.localRoadName,
      projectCategory: road?.projectCategory || road?.type || inspection.projectCategory || '',
      projectDescription: road?.projectDescription || road?.description || inspection.projectDescription || '',
      location: road?.location || inspection.location || '',
      dateStarted: road?.dateBuilt || inspection.dateStarted || '',
      targetCompletionDate: road?.targetCompletionDate || inspection.targetCompletionDate || '',
      noOfExtensions: road?.noOfExtensions || inspection.noOfExtensions || '',
      actualCompletionDate: road?.actualCompletionDate || inspection.actualCompletionDate || '',
      // @mine — the edited record's own follow-up year bounds the inspection date.
      annualFollowUpYear: inspection.annualFollowUpYear,
      roadNetworkId: road?.roadNetworkId || inspection.roadNetworkId || '',
      roadName: road?.roadName || road?.name || inspection.roadName || inspection.localRoadName,
      components: road?.components || inspection.components || '',
      description: road?.description || inspection.description || '',
      date: isPendingInspectionRecord(inspection) ? '' : inspection.date,
      inspectionType: inspection.inspectionType === 'Monitoring and Maintenance Inspection' ? inspection.inspectionType : '',
      conditionRating: String(inspection.conditionRating),
      remarks: inspection.remarks || '',
    }));
    setValidationNotice('');
    setActiveFormTab('project');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const localRoad = localRoadList.find(item => item.id === formData.localRoadId);
    const selectedRatings = Object.values(conditionRatings).filter((rating) => rating !== 'N/A');
    const missingConditionRatings = conditionAssessmentLabels.filter((label) => !conditionRatings[label]);
    const validationMessages = [];
    if (!localRoad) validationMessages.push('Select a Project / Program / Activity Name.');
    if (!hasFourDigitYear(formData.date)) validationMessages.push(formData.date ? 'Please fill out valid date.' : 'Enter the inspection date.');
    const minimumInspectionDate = earliestInspectionDate(localRoad?.actualCompletionDate, formData.annualFollowUpYear);
    if (!minimumInspectionDate) validationMessages.push('The project completion date could not be verified.');
    else if (formData.date && formData.date < minimumInspectionDate) validationMessages.push('Please fill out valid date.');
    if (!formData.inspectionType) validationMessages.push('Select an inspection type.');
    if (missingConditionRatings.length > 0) {
      validationMessages.push('Select a condition rating for every category. Choose N/A when it does not apply.');
    }
    const applicable = conditionAssessmentLabels.filter(label => conditionRatings[label] && conditionRatings[label] !== 'N/A');
    const missingRemarks = applicable.filter(label => conditionRatings[label] !== 'Good' && !conditionRemarks[label]?.trim());
    const missingAttachments = applicable.filter(label => conditionRatings[label] !== 'Good' && !(conditionAttachments[label]?.length));
    if (!missingConditionRatings.length && !applicable.length) validationMessages.push('Select at least one applicable component to generate inspection findings.');
    if (missingRemarks.length) validationMessages.push(`Remarks are required for: ${missingRemarks.join(', ')}.`);
    if (missingAttachments.length) validationMessages.push(`Attachments are required for: ${missingAttachments.join(', ')}.`);
    if (uploadingCategory) validationMessages.push('Wait for the attachment upload to finish.');
    if (validationMessages.length > 0) {
      setValidationNotice(validationMessages.join(' '));
      if (!localRoad) returnToSection(projectSectionRef, 'project', '[aria-label="Project / Program / Activity Name"]');
      else if (!formData.date || !formData.inspectionType) returnToSection(inspectionSectionRef, 'inspection', 'input[type="date"]');
      else if (missingConditionRatings.length > 0) returnToSection(inspectionSectionRef, 'inspection');
      else returnToSection(inspectionSectionRef, 'inspection', 'textarea');
      return;
    }

    if (localRoad) {
      const averageRating = selectedRatings.length
        ? selectedRatings.reduce((total, rating) => total + getRatingScore(rating), 0) / selectedRatings.length
        : 0;
      // @mine 2026-11-11 — per-category remarks + files travel with the inspection.
      const categoryRemarks = Object.fromEntries(
        Object.entries(conditionRemarks).filter(([, value]) => value.trim() !== ''),
      );
      const inspectionData = {
        ...formData,
        attachment: editingInspection?.attachment,
        remarks: findingsSummary(conditionRatings, conditionRemarks),
        conditionRating: averageRating,
        conditionRatings,
        conditionRemarks: categoryRemarks,
        conditionAttachments,
        validationStatus: editingInspection?.validationStatus || 'Pending Validation',
        localRoadName: localRoad.name,
        inspector: editingInspection?.inspector || currentUser,
      };
      if (savingRef.current) return;
      savingRef.current = true;
      setIsSaving(true);
      try {
        const saved = editingInspection
          ? await onEditInspection({ ...editingInspection, ...inspectionData })
          : await onAddInspection(inspectionData);
        if (saved === false) return;
      } finally { savingRef.current = false; setIsSaving(false); }
      setEditingInspection(null);
      setConditionRatings({});
      setConditionRemarks({});
      setConditionAttachments({});
      setCategoryNotice('');
        setValidationNotice('');
      setFormData({
        localRoadId: '',
        projectName: '',
        projectCategory: '',
        projectDescription: '',
        location: '',
        dateStarted: '',
        targetCompletionDate: '',
        noOfExtensions: '',
        actualCompletionDate: '',
        roadNetworkId: '',
        roadName: '',
        components: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        inspectionType: '',
        conditionRating: 'Good',
        remarks: '',
        annualFollowUpYear: undefined,
      });
      setShowForm(false);
    }
  };

  const printInspection = (inspection: Inspection, referenceId: string) => {
    const road = localRoadList.find((item) => item.id === inspection.localRoadId);
    const projectName = road?.projectName || road?.name || inspection.projectName || inspection.localRoadName;
    // @mine 2026-11-11 — the printed assessment carries each category's remark.
    const assessmentFields = inspectionCategories.map(({ label }) => {
      const rating = inspection.conditionRatings?.[label];
      const remark = inspection.conditionRemarks?.[label];
      return {
        label,
        value: [rating || 'Not assessed', remark ? `Remarks: ${remark}` : ''].filter(Boolean).join(' — '),
      };
    });
    void recordClientActivity(
      currentUser,
      'Print Requested',
      `Requested print for inspection ${referenceId} (${projectName})`,
    ).catch((error: unknown) => console.error('Failed to record inspection print activity.', error));
    setPrintAttachment(inspection.attachment);
    setPrintSections([
      {
        title: 'Project Information',
        fields: [
          { label: 'Project / Program / Activity Name', value: projectName, width: 'half' },
          { label: 'Project Category', value: road?.projectCategory || road?.type || inspection.projectCategory, width: 'half' },
          { label: 'Project Description', value: road?.projectDescription || road?.description || inspection.projectDescription },
          { label: 'Location', value: road?.location || inspection.location, width: 'half' },
          { label: 'Date Started', value: road?.dateBuilt || inspection.dateStarted, width: 'half' },
          { label: 'Target Completion Date', value: road?.targetCompletionDate || inspection.targetCompletionDate, width: 'half' },
          { label: 'No. of Extensions', value: Number(road?.noOfExtensions || inspection.noOfExtensions) ? road?.noOfExtensions || inspection.noOfExtensions : '', width: 'half' },
          { label: 'Actual Completion Date', value: road?.actualCompletionDate || inspection.actualCompletionDate, width: 'half' },
        ],
      },
      {
        title: 'Road Information',
        fields: [
          { label: 'Road Network ID No.', value: road?.roadNetworkId || inspection.roadNetworkId, width: 'full' },
          { label: 'Road Name', value: road?.roadName || road?.name || inspection.roadName, width: 'full' },
          { label: 'Components', value: road?.components || inspection.components, width: 'full' },
          { label: 'Description', value: road?.description || inspection.description, width: 'full' },
        ],
      },
      {
        title: 'Inspector Information',
        fields: [
          { label: 'Inspection Date', value: isPendingInspectionRecord(inspection) ? '' : inspection.date, width: 'half' },
          { label: 'Inspection Type', value: inspection.inspectionType, width: 'half' },
        ],
      },
      {
        title: 'Local Road Condition Assessment',
        fields: assessmentFields,
      },
      {
        title: 'Inspection Findings',
        fields: [{ label: 'Findings', value: isPendingInspectionRecord(inspection) ? '' : findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks }],
      },
      {
        title: 'Prepared by',
        fields: [
          { label: 'Site Inspector', value: inspection.inspector },
        ],
      },
    ]);
    setSelectedInspection(null);
  };

  // @mine — task 14: the overview is printable as a whole or for one year, Head Engineer only.
  const canPrintOverview = ['Admin', 'Head Engineer'].includes(userRole);
  const overviewYears = Array.from(new Set(inspections
    .filter(inspection => !isPendingInspectionRecord(inspection))
    .map(inspection => (inspection.date || '').slice(0, 4))
    .filter(year => /^\d{4}$/.test(year)))).sort();
  const printOverview = (year: string) => {
    const sections: PrintSection[] = filteredInspections
      .filter(({ inspection }) => year === 'all' || (!isPendingInspectionRecord(inspection) && inspection.date?.slice(0, 4) === year))
      .map(({ inspection }) => {
        const road = localRoadList.find(item => item.id === inspection.localRoadId);
        return {
          title: road?.projectName || road?.name || inspection.projectName || inspection.localRoadName || 'Project',
          fields: [
            { label: 'Date of Inspection', value: isPendingInspectionRecord(inspection) ? '' : inspection.date || '', width: 'half' as const },
            { label: 'Amount Contracted', value: road?.contractedAmount ? `Php ${formatSavedProjectCurrency(String(road.contractedAmount))}` : '', width: 'half' as const },
            { label: 'Findings / Remarks', value: isPendingInspectionRecord(inspection) ? '' : findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks || '', width: 'full' as const },
          ],
        };
      });
    if (!sections.length) { window.alert('There is nothing to print for this selection yet.'); return; }
    setPrintAttachment(undefined);
    setPrintSections(sections);
  };

  return (
    <>
    {printSections && (
      <PrintDocument
        title="Local Road Project Inspection Results"
        sections={printSections}
        attachment={printAttachment}
        onComplete={() => {
          setPrintSections(null);
          setPrintAttachment(undefined);
        }}
      />
    )}
    <div className="inspection-results flex min-h-screen flex-col bg-[#E3EEF9] p-6 text-slate-800 sm:px-7">
      <div className="flex w-full flex-1 flex-col">
        <div className="mb-9 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-blue-700">Inspection Management</h1>
            <p className="inspection-subtitle mt-1 text-base text-slate-500">
              Field audits, local road condition assessments, and inspection findings.
            </p>
          </div>

        </div>

        {showForm && (
          <div className="module-form-backdrop fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-md">
            <div className="module-form-panel relative z-[10000] flex h-[min(560px,calc(100vh-48px))] min-h-0 w-full max-w-[840px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-3">
                <div>
                  <h2 className="text-xl font-bold text-white">{editingInspection ? 'Edit Inspection' : 'Encoding Inspection'}</h2>
                  <p className="text-sm text-blue-100">Municipal Engineering Office · Inspection Entry</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingInspection(null);
                    setConditionRatings({});
                                                  setValidationNotice('');
                  }}
                  className="text-gray-300 transition-colors hover:text-white"
                  aria-label="Close inspection form"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <nav className="flex shrink-0 gap-2 overflow-x-auto border-b bg-slate-50 px-4 py-2" aria-label="Inspection form sections">
                {inspectionFormTabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => moveToFormTab(index)}
                    aria-current={activeFormTab === tab.id ? 'step' : undefined}
                    className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      activeFormTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                    }`}
                  >
                    {index + 1}. {tab.label}
                  </button>
                ))}
              </nav>

              <form onSubmit={handleSubmit} onInvalidCapture={event => {
                const input = event.target as HTMLInputElement;
                if (input.type === 'date' && (input.validity.rangeUnderflow || input.validity.rangeOverflow || input.validity.badInput)) input.setCustomValidity('Please fill out valid date.');
              }} onInputCapture={event => {
                const input = event.target as HTMLInputElement;
                if (input.type === 'date') input.setCustomValidity('');
              }} className="form-modal-fields flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  ref={formScrollRef}
                  onScroll={updateActiveFormTab}
                  className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
                >
                <section ref={projectSectionRef} className="scroll-mt-4 border-b pb-6">
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Project / Program / Activity Name*</label>
                      <input
                        type="text"
                        value={formData.projectName}
                        readOnly
                        aria-label="Project / Program / Activity Name"
                        aria-required="true"
                        className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Project Category</label>
                      <input
                        type="text"
                        value={formData.projectCategory}
                        readOnly
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Project Description</label>
                    <textarea
                      value={formData.projectDescription}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                      <input
                        type="text"
                        value={formData.location}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date Started</label>
                      <input
                        type="date"
                        value={formData.dateStarted}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Target Completion Date</label>
                      <input
                        type="date"
                        value={formData.targetCompletionDate}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">No. of Extensions</label>
                      <input
                        type="text"
                        value={formData.noOfExtensions}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Actual Completion Date</label>
                      <input
                        type="date"
                        value={formData.actualCompletionDate}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
                </section>

                <section ref={roadSectionRef} className="scroll-mt-4 border-b pb-6 pt-5">
                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Road Information</h3>
                  <div className="space-y-3 mb-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Road Network ID No.</label>
                      <AutoGrowTextarea
                        rows={2}
                        value={formData.roadNetworkId}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Road Name</label>
                      <AutoGrowTextarea
                        rows={2}
                        value={formData.roadName}
                        readOnly
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Components</label>
                    <input
                      type="text"
                      value={formData.components}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <textarea
                      value={formData.description}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-700 cursor-not-allowed"
                      rows={2}
                    />
                  </div>
                </div>
                </section>

                <section ref={inspectionSectionRef} className="scroll-mt-4 pt-5">
                <div className="border-b pb-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Inspector Information</h3>
                  <div className="rounded-lg border border-gray-300 overflow-hidden bg-white">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                      <div className="border-r border-gray-300">
                        <label className="block px-4 pt-3 text-[1.05rem] font-bold text-gray-900">Inspection Date*</label>
                        <div className="p-3 bg-[#f3f4f6]">
                          <input
                            type="date"
                            min={earliestInspectionDate(formData.actualCompletionDate, formData.annualFollowUpYear) || '2000-01-01'}
                            max="9999-12-31"
                            onInvalid={e => e.currentTarget.setCustomValidity(e.currentTarget.validity.valueMissing ? 'Please fill out this field.' : 'Please fill out valid date.')}
                            onInput={e => e.currentTarget.setCustomValidity('')}
                            defaultValue={formData.date}
                            onChange={(e) => { if (e.target.value) setFormData(prev => ({ ...prev, date: e.target.value })); }}
                            onBlur={(e) => { if (!e.target.value) setFormData(prev => ({ ...prev, date: '' })); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-base"
                            required
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block px-4 pt-3 text-[1.05rem] font-bold text-gray-900">Inspection Type*</label>
                        <div className="p-3 bg-[#f3f4f6]">
                          <Select
                            value={formData.inspectionType}
                            onValueChange={(value) => setFormData({ ...formData, inspectionType: value })}
                            required
                          >
                            <SelectTrigger aria-label="Inspection type">
                              <SelectValue placeholder="Select Type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Monitoring and Maintenance Inspection">Monitoring and Maintenance Inspection</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Local Road Condition Assessment*</h3>
                  <div className="overflow-hidden rounded-lg border border-gray-300 bg-white">
                    <table className="w-full border-collapse text-left text-sm text-gray-800">
                      <thead>
                        <tr className="bg-[#1a1d3f] text-white">
                          <th className="border-r border-gray-300 px-3 py-3 font-semibold align-top w-1/4">Pavement Type / Road Elements</th>
                          <th className="border-r border-gray-300 px-3 py-3 font-semibold align-top w-1/4">Condition Rating</th>
                          <th className="px-3 py-3 font-semibold align-top w-1/2">Field Condition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspectionCategories.map((row) => (
                          <Fragment key={row.label}>
                          <tr className="border-t border-gray-300 align-top">
                            <td className="border-r border-gray-300 px-3 py-3 align-top font-medium">{row.label}</td>
                            <td className="border-r border-gray-300 px-3 py-3 align-top">
                              <div className="flex flex-col gap-3">
                                {conditionRatingOptions.map((option) => (
                                  <label key={`${row.label}-${option}`} className="flex items-center gap-2 text-gray-700">
                                    <input
                                      type="radio"
                                      name={`condition-${row.label}`}
                                      value={option}
                                      checked={conditionRatings[row.label] === option}
                                      onChange={() => handleConditionRatingChange(row.label, option)}
                                      className="h-4 w-4 text-[#0ea5e9]"
                                    />
                                    <span>{option}</span>
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-top text-gray-700">
                              <div className="divide-y divide-gray-300 overflow-hidden border border-gray-300">
                                {conditionRatingOptions.map((option) => {
                                  const isSelected = conditionRatings[row.label] === option;
                                  return (
                                    <div
                                      key={`${row.label}-${option}`}
                                      className={isSelected ? 'bg-[#eaf9ff]' : 'bg-white'}
                                    >
                                      <div className="flex items-center justify-between px-2 py-2">
                                        <span className={`text-sm font-bold uppercase tracking-wide ${isSelected ? 'text-[#0ea5e9]' : 'text-gray-700'}`}>
                                          {option}
                                        </span>
                                        {isSelected && <span className="text-[10px] font-medium text-[#0ea5e9]">Selected</span>}
                                      </div>
                                      <p className="px-2 pb-2 text-sm leading-relaxed text-gray-700">
                                        {row.details[option as keyof typeof row.details]}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                          {/* @mine 2026-11-11 — remark + attachments underneath each category. */}
                          <tr className="border-t border-gray-300 bg-white align-top">
                            <td colSpan={3} className="px-3 py-3">
                              {/* @mine 2026-11-11 — remarks first, attachments directly underneath. */}
                              <div className="flex flex-col gap-3">
                                <div>
                                  <label
                                    htmlFor={`category-remark-${row.key}`}
                                    className="mb-1 block text-sm font-semibold text-gray-700"
                                  >
                                    Remarks {conditionRatings[row.label] && !['N/A', 'Good'].includes(conditionRatings[row.label]) ? '*' : ''}
                                  </label>
                                  <AutoGrowTextarea
                                    id={`category-remark-${row.key}`}
                                    data-category-remark={row.label}
                                    value={conditionRemarks[row.label] ?? ''}
                                    onChange={(event) => handleCategoryRemarkChange(row.label, event.target.value)}
                                    placeholder={`Observations, defects, or notes for ${row.label}...`}
                                    className="min-h-[2.75rem] w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-[#0ea5e9]"
                                  />
                                </div>
                                <div>
                                  <span className="mb-1 block text-sm font-semibold text-gray-700">
                                    Attachments {conditionRatings[row.label] && !['N/A', 'Good'].includes(conditionRatings[row.label]) ? '*' : ''}
                                  </span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 hover:bg-gray-50">
                                      <input
                                        type="file"
                                        multiple
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        className="hidden"
                                        aria-label={`Attach files for ${row.label}`}
                                        onChange={(event) => void handleCategoryAttachmentChange(row.label, event)}
                                      />
                                      {uploadingCategory === row.label ? 'Uploading...' : 'Add file'}
                                    </label>
                                    {(conditionAttachments[row.label] ?? []).map((file, index) => (
                                      <span
                                        key={`${file.name}-${index}`}
                                        className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs text-slate-700"
                                      >
                                        <FileText className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                        {file.dataUrl && !file.staged ? (
                                          <button
                                            type="button"
                                            onClick={() => setSelectedInspectionAttachment(file as Inspection['attachment'])}
                                            className="max-w-[12rem] truncate text-left hover:underline"
                                          >
                                            {file.name}
                                          </button>
                                        ) : (
                                          <span className="max-w-[12rem] truncate" title={file.name}>{file.name}</span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => removeCategoryAttachment(row.label, index)}
                                          aria-label={`Remove ${file.name} from ${row.label}`}
                                          className="rounded-full p-0.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ))}
                                    {(conditionAttachments[row.label] ?? []).length === 0 && uploadingCategory !== row.label && (
                                      <span className="text-xs text-slate-500">No files attached.</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {categoryNotice && (
                    <div role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                      {categoryNotice}
                    </div>
                  )}
                </div>

                <div className="border-b pb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Inspection Findings*</h3>
                  <div aria-label="Inspection findings summary" className="w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-slate-50 px-3 py-2 text-gray-900">
                    {findingsSummary(conditionRatings, conditionRemarks) || 'The summary will appear as component remarks are entered.'}
                  </div>
                </div>

                <div className="border-b pb-6 text-gray-900">
                  <p className="text-sm">Prepared by:</p>
                  <p className="font-bold uppercase">{currentUser}</p>
                  <p className="text-sm">Site Inspector</p>
                </div>
                </section>
                </div>

                <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
                  {validationNotice && (
                    <div role="alert" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{validationNotice}</span>
                    </div>
                  )}
                  <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowForm(false);
                      setEditingInspection(null);
                      setConditionRatings({});
                                                        setValidationNotice('');
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {isSaving ? (editingInspection ? 'Updating...' : 'Submitting...') : (editingInspection ? 'Save Changes' : 'Submit Inspection')}
                  </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        <Dialog
          open={selectedInspection !== null}
          onOpenChange={(open) => {
            if (!open) setSelectedInspection(null);
          }}
        >
          {selectedInspection && (() => {
            const { inspection, referenceId } = selectedInspection;
            const score = Math.round(getRatingScore(inspection.conditionRating) * 10);
            const details = Object.entries(inspection.conditionRatings || {})
              .filter(([, value]) => value !== 'N/A');
            const defects = details.filter(([, value]) => value === 'Fair' || value === 'Poor' || value === 'Bad');
            const condition = isPendingInspectionRecord(inspection) ? 'Pending' : getConditionLabel(inspection);
            const road = localRoadList.find((item) => item.id === inspection.localRoadId);
            const projectName = road?.projectName || road?.name || inspection.projectName || inspection.localRoadName;

            return (
              <DialogContent className="inspection-detail-dialog card-details-dialog max-h-[min(620px,calc(100vh-32px))] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl sm:max-w-[840px]">
                <div className="bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-3 pr-14 text-white">
                  <DialogTitle className="text-xl font-bold text-white">{projectName}</DialogTitle>
                  <DialogDescription className="text-sm text-blue-100">Municipal Engineering Office · Inspection Entry · {referenceId}</DialogDescription>
                </div>
                <div className="max-h-[calc(min(620px,100vh-32px)-76px)] space-y-5 overflow-y-auto px-6 pb-8 pt-5">
                  <section className="border-b pb-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Project Information</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {[
                      { label: 'Project / Program / Activity Name', value: projectName },
                      { label: 'Project Category', value: road?.projectCategory || road?.type || inspection.projectCategory || 'Local Road' },
                      { label: 'Location', value: road?.location || inspection.location || '' },
                      { label: 'Inspection Date', value: isPendingInspectionRecord(inspection) ? '' : inspection.date || '' },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <span className="mb-2 block text-sm font-medium text-gray-700">{label}</span>
                        <span className="block min-h-[3rem] rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">{value}</span>
                      </div>
                    ))}
                  </div>
                  </section>

                  <section className="border-b pb-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Road Information</h3>
                    <div className="space-y-4">
                      {[
                        ['Road Network ID No.', road?.roadNetworkId || inspection.roadNetworkId || ''],
                        ['Road Name', road?.roadName || road?.name || inspection.roadName || 'Not specified'],
                      ].map(([label, value]) => (
                        <div key={label}><span className="mb-2 block text-sm font-medium text-gray-700">{label}</span><span className="block min-h-[3rem] whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">{value}</span></div>
                      ))}
                    </div>
                  </section>

                  <section className="border-b pb-6">
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Inspection Details</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {[
                        ['Inspector', inspection.inspector || ''],
                        ['Inspection Type', isPendingInspectionRecord(inspection) ? '' : inspection.inspectionType || ''],
                        ['Integrity', `${score}%`],
                        ['Condition', condition],
                        [inspection.isAnnualFollowUp || inspection.isScheduledAnnualFollowUp ? 'Follow-up Status' : 'Validation Status', isPendingInspectionRecord(inspection) ? 'Pending' : inspection.validationStatus || 'Pending Validation'],
                      ].map(([label, value]) => (
                        <div key={label}><span className="mb-2 block text-sm font-medium text-gray-700">{label}</span><span className="block min-h-[3rem] rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">{value}</span></div>
                      ))}
                    </div>
                    <p className="mb-2 mt-4 block text-sm font-medium text-gray-700">Observation Notes</p>
                    <p className="min-h-[5rem] whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm leading-6 text-gray-700">
                      {isPendingInspectionRecord(inspection) ? '' : findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks || ''}
                    </p>
                  </section>
                  {(road?.projectDescription || road?.description || inspection.projectDescription || inspection.roadNetworkId || road?.roadNetworkId) && (
                    <section>
                      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Project Details</h3>
                      <div className="space-y-3 rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-sm text-gray-700">
                        {(road?.projectDescription || road?.description || inspection.projectDescription) && (
                          <p><span className="font-semibold text-slate-700">Scope: </span>{road?.projectDescription || road?.description || inspection.projectDescription}</p>
                        )}
                        {(road?.roadNetworkId || inspection.roadNetworkId) && (
                          <p><span className="font-semibold text-slate-700">Road Network ID: </span>{road?.roadNetworkId || inspection.roadNetworkId}</p>
                        )}
                      </div>
                    </section>
                  )}

                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Local Road Condition Assessment</h3>
                    {details.length > 0 ? (
                      <div className="space-y-2">
                        {inspectionCategories.map(({ label, details: descriptors }) => {
                          const storedRating = inspection.conditionRatings?.[label];
                          const rating = storedRating && storedRating !== 'N/A' ? storedRating : '';
                          const remark = inspection.conditionRemarks?.[label] || '';
                          const files = inspection.conditionAttachments?.[label] ?? [];
                          return (
                            <div
                              key={label}
                              data-category={label}
                              className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-medium text-slate-700">{label}</span>
                                {rating ? (
                                  <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${
                                    rating === 'Good' ? 'bg-emerald-50 text-emerald-700' :
                                    rating === 'Fair' ? 'bg-amber-50 text-amber-700' :
                                    rating === 'N/A' ? 'bg-slate-200 text-slate-600' :
                                    'bg-rose-50 text-rose-700'
                                  }`}>{rating}</span>
                                ) : (
                                  <span className="shrink-0 text-xs italic text-slate-500">
                                    {storedRating === 'N/A' ? 'N/A' : 'Not assessed'}
                                  </span>
                                )}
                              </div>
                              {rating ? (
                                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                  {descriptors[rating as ConditionRating]}
                                </p>
                              ) : null}
                              {remark ? (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                                  <span className="font-semibold">Remarks: </span>{remark}
                                </p>
                              ) : null}
                              {files.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-2">
                                  {files.map((file, index) => (
                                    <button
                                      key={`${file.name}-${index}`}
                                      type="button"
                                      onClick={() => setSelectedInspectionAttachment(file as Inspection['attachment'])}
                                      className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs text-blue-700 hover:bg-blue-50"
                                    >
                                      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span className="max-w-[14rem] truncate">{file.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-3 text-sm text-gray-500">
                        No condition details recorded.
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">Defects &amp; Maintenance Requisitions</h3>
                    {defects.length > 0 ? (
                      <ul className="space-y-1.5">
                        {defects.map(([element, rating]) => (
                          <li key={element} className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-600">
                            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                            <span>{element}{details.length > 1 ? ` · ${rating}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-3 text-sm text-gray-500">
                        {details.length > 0 ? 'No defects identified.' : 'No condition details recorded.'}
                      </p>
                    )}
                  </section>
                  <section className="border-t pt-5">
                    <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">Submitted Attachments</h3>
                    {inspection.attachment ? (
                      <div className="overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
                        <button
                          type="button"
                          onClick={() => setSelectedInspectionAttachment(inspection.attachment ?? null)}
                          className="flex w-full flex-col items-center justify-center bg-slate-100 p-3 text-sm text-blue-700 hover:bg-blue-50"
                        >
                          {inspection.attachment.type.startsWith('image/') ? (
                            <img src={inspection.attachment.dataUrl} alt="" className="h-28 w-full object-contain" />
                          ) : (
                            <FileText className="mb-2 h-10 w-10" aria-hidden="true" />
                          )}
                          <span className="mt-2 font-medium hover:underline">{inspection.attachment.name}</span>
                          <span className="mt-1 text-xs text-slate-500">Select to view full attachment</span>
                        </button>
                      </div>
                    ) : (
                      <p className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-3 text-sm text-gray-500">
                        No attachments available.
                      </p>
                    )}
                  </section>
                  {canPrint && (
                    <div className="flex justify-end border-t border-slate-200 pt-5">
                      <button type="button" onClick={() => printInspection(inspection, referenceId)} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800">
                        <Printer className="h-4 w-4" /> Print
                      </button>
                    </div>
                  )}
                </div>
              </DialogContent>
            );
          })()}
        </Dialog>

        <Dialog open={selectedInspectionAttachment !== null} onOpenChange={(open) => !open && setSelectedInspectionAttachment(null)}>
          {selectedInspectionAttachment && (
            <DialogContent className="max-h-[min(760px,calc(100vh-32px))] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl sm:max-w-[900px]">
              <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 pr-12 text-white">
                <DialogTitle className="truncate text-base font-bold text-white">{selectedInspectionAttachment.name}</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-blue-100">{selectedInspectionAttachment.type || 'File'}</DialogDescription>
              </div>
              <div className="flex max-h-[calc(min(760px,100vh-32px)-84px)] min-h-[320px] items-center justify-center overflow-auto bg-slate-100 p-6">
                {selectedInspectionAttachment.type.startsWith('image/') ? (
                  <img
                    src={selectedInspectionAttachment.dataUrl}
                    alt={selectedInspectionAttachment.name}
                    className="max-h-[min(620px,calc(100vh-160px))] max-w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={selectedInspectionAttachment.dataUrl}
                    title={selectedInspectionAttachment.name}
                    className="h-[min(620px,calc(100vh-160px))] w-full rounded-lg border border-slate-200 bg-white"
                  />
                )}
              </div>
            </DialogContent>
          )}
        </Dialog>

        <div className="mb-8 flex flex-col items-stretch justify-between gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center">
          <label className="relative block w-full min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search..."
              aria-label="Search inspections"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-2 text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <div className="relative w-[190px] max-w-full shrink-0">
                <Calendar aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                <input type="date" aria-label="Filter by inspection date" min="1000-01-01" max="9999-12-31" ref={filterDateRef}
                  onChange={event => { if (event.currentTarget.value && event.currentTarget.validity.valid) setFilterDate(event.currentTarget.value); }}
                  onBlur={event => { if (!event.currentTarget.value) setFilterDate(''); }}
                  className="date-filter-input h-auto min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-8 text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 sm:w-[190px]" />
              <DateCalendarButton inputRef={filterDateRef} value={filterDate} onChange={setFilterDate} label="Open inspection date calendar" />
              </div>
              {filterDate && <button type="button" onClick={() => { if (filterDateRef.current) filterDateRef.current.value = ''; setFilterDate(''); }} className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-900">Clear</button>}
            </div>

        </div>

        <section aria-label="Inspection records">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div role="tablist" aria-label="Inspection views" className="flex flex-wrap items-end gap-2 border-b border-slate-200">
              <button type="button" role="tab" aria-selected={inspectionView === 'history'} onClick={() => setInspectionView('history')} className={`inline-flex items-center gap-2 rounded-t-2xl px-6 py-4 font-semibold transition-colors ${inspectionView === 'history' ? 'border-b-2 border-blue-600 bg-white text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}><ClipboardCheck className="h-5 w-5" aria-hidden="true" /> Inspection History</button>
              <button type="button" role="tab" aria-selected={inspectionView === 'overview'} onClick={() => setInspectionView('overview')} className={`inline-flex items-center gap-2 rounded-t-2xl px-6 py-4 font-semibold transition-colors ${inspectionView === 'overview' ? 'border-b-2 border-blue-600 bg-white text-blue-600' : 'text-slate-500 hover:text-slate-900'}`}><Table2 className="h-5 w-5" aria-hidden="true" /> Overview</button>
            </div>
            <span className="text-sm text-slate-500">{filteredInspections.length} {filteredInspections.length === 1 ? 'record' : 'records'} listed</span>
          </div>
          {inspectionView === 'overview' ? <div role="tabpanel" aria-label="Inspection Overview" className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1000px] table-fixed border-separate border-spacing-0 text-left"><colgroup><col style={{width: '30%'}} /><col style={{width: '15%'}} /><col style={{width: '16%'}} /><col />{canPrintOverview && <col style={{width: 210}} />}</colgroup><thead className="border-b bg-gray-50"><tr><th className="px-6 py-3 text-xs font-semibold uppercase text-slate-600">Project Name</th><th className="px-6 py-3 text-xs font-semibold uppercase text-slate-600">Inspection Date</th><th className="px-6 py-3 text-xs font-semibold uppercase text-slate-600">Contracted Amount</th><th className="px-6 py-3 text-xs font-semibold uppercase text-slate-600">Findings</th>{canPrintOverview && <th className="w-px whitespace-nowrap px-6 py-3 text-right"><span className="inline-flex items-center gap-2"><StyledFilterSelect label="Print inspection overview year" value={overviewPrintYear} onChange={setOverviewPrintYear} options={[{value: 'all', label: 'All years'}, ...overviewYears.map(year => ({value: year, label: year}))]} /><button type="button" aria-label="Print inspection overview" onClick={() => printOverview(overviewPrintYear)} className="inline-flex items-center rounded-lg p-2 text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" title="Print overview"><Printer className="h-5 w-5" aria-hidden="true" /></button></span></th>}</tr></thead>
              <tbody className="divide-y divide-gray-200">{filteredInspections.map(({inspection, referenceId}) => {
                const road = localRoadList.find(item => item.id === inspection.localRoadId);
                const name = road?.projectName || road?.name || inspection.projectName || inspection.localRoadName;
                const pending = isPendingInspectionRecord(inspection);
                return <tr key={inspection.id} tabIndex={0} aria-label={`View inspection details for ${name}`} onClick={() => setSelectedInspection({inspection, referenceId})} onKeyDown={event => {if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); setSelectedInspection({inspection, referenceId});}}} className="cursor-pointer hover:bg-blue-50 focus-visible:bg-blue-50"><td className="break-words px-6 py-4 font-medium text-blue-700">{name}</td><td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{pending ? '' : inspection.date || ''}</td><td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600">{road?.contractedAmount != null && road.contractedAmount !== '' ? `Php ${formatSavedProjectCurrency(String(road.contractedAmount))}` : ''}</td><td colSpan={canPrintOverview ? 2 : 1} className="whitespace-pre-wrap px-6 py-4 text-sm text-slate-600">{pending ? '' : findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks || ''}</td></tr>;
              })}{filteredInspections.length === 0 && <tr><td colSpan={canPrintOverview ? 5 : 4} className="px-6 py-10 text-center text-slate-500">No inspections match your search or filters.</td></tr>}</tbody>
            </table></div> : (
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredInspections.map(({ inspection, referenceId }) => {
              const road = localRoadList.find((item) => item.id === inspection.localRoadId);
              const isPendingInspection = isPendingInspectionRecord(inspection);
              const projectName = road?.projectName || road?.name || inspection.projectName || inspection.localRoadName;
              return (
                <article
                  key={inspection.id}
                  tabIndex={0}
                  aria-label={`View full inspection ${referenceId} for ${projectName}`}
                  onClick={() => setSelectedInspection({ inspection, referenceId })}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                      event.preventDefault();
                      setSelectedInspection({ inspection, referenceId });
                    }
                  }}
                  title="Click to view full inspection details"
                  className="group flex h-auto cursor-pointer flex-col rounded-[22px] border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 hover:border-blue-300 hover:shadow-[0_0_0_3px_rgba(59,130,246,0.12),0_12px_28px_rgba(37,99,235,0.16)] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    <div className="flex items-center justify-between gap-3 text-sm leading-5 text-slate-700">
                      <span className="truncate">{referenceId}</span>
                      <span className="shrink-0 text-right">{isPendingInspection ? '' : inspection.date || ''}</span>
                    </div>
                    <h3 className="inspection-road-name mt-3 min-w-0 truncate text-base font-bold text-slate-900 transition-colors group-hover:text-blue-700" title={projectName}>
                      {projectName}
                    </h3>
                    <p className="inspection-road-category mt-1 text-sm text-slate-500">
                      {road?.projectCategory || road?.type || 'Local Road'}
                    </p>
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {inspection.isScheduledAnnualFollowUp
                            ? `Annual Follow-up · ${inspection.annualFollowUpYear}`
                            : isPendingInspection
                            ? 'Validation Inspection'
                            : 'Inspection Findings'}
                      </span>
                      {inspection.isScheduledAnnualFollowUp && <p className="mt-1 text-sm text-slate-700">Provide the necessary inspection details.</p>}
                      {!isPendingInspection && <p className="inspection-remarks mt-1 truncate text-sm leading-6 text-slate-700">
                        {findingsSummary(inspection.conditionRatings || {}, inspection.conditionRemarks || {}) || inspection.remarks || 'No observation notes recorded.'}
                      </p>}
                    </div>
                  <footer className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isPendingInspection
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {isPendingInspection ? 'Pending' : 'Completed'}
                    </span>
                    <div className="flex shrink-0 items-center gap-3">
                      {!isPendingInspection && inspection.date && <span className="flex shrink-0 items-center gap-1.5 text-sm text-slate-500">
                        <Calendar className="h-4 w-4" />{inspection.date}
                      </span>}
                      {!isAdminReadDeleteOnly && <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEditingInspection(inspection);
                        }}
                        aria-label={`${isPendingInspection ? 'Record' : 'Edit'} inspection ${referenceId}`}
                        title={isPendingInspection ? 'Record inspection' : 'Edit inspection'}
                        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {isPendingInspection
                          ? <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                          : <Pencil className="h-4 w-4" aria-hidden="true" />}
                      </button>}
                      {['Admin', 'Head Engineer'].includes(userRole) && <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPendingDelete(inspection);
                        }}
                        aria-label={`Delete inspection ${referenceId}`}
                        title="Delete"
                        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>}
                    </div>
                  </footer>
                </article>
              );
            })}
            {filteredInspections.length === 0 && (
              <div className="col-span-full rounded-[22px] border border-slate-200 bg-white px-6 py-14 text-center text-slate-500">
                {inspections.length === 0
                  ? 'No inspections recorded yet.'
                  : 'No inspections match your search or selected filter.'}
              </div>
            )}
          </div>)}
        </section>
        <div className="mb-10 mt-auto flex flex-col gap-2 border-t border-slate-200 px-1 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {filteredInspections.length} of {new Set(inspections.map(inspection => inspection.localRoadId)).size} projects</span>
          <span className="font-medium text-blue-700">Municipality of Mabini, Batangas</span>
        </div>
      </div>
      <ConfirmActionDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete inspection?"
        description={`Archive the inspection for ${pendingDelete?.localRoadName || 'this road'}? It can be restored from System Management.`}
        onConfirm={() => {
          if (pendingDelete) void onDeleteInspection(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
    </>
  );
}
