import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { AutoGrowTextarea } from './ui/textarea';
import { formatProjectCurrency, formatSavedProjectCurrency, hasFourDigitYear, isValidProjectCurrency } from '@/lib/project-form-validation';
import { attachmentError } from '@/lib/attachment-validation';
import { startProjectSaveDelay } from '@/lib/project-save-delay';

interface ProjectAttachment {
  name: string;
  type: string;
  dataUrl: string;
  category: string;
  // @mine — Supabase Storage path for the file (Phase 2, 2026-11-09);
  // optional so records created before Storage still type-check.
  storagePath?: string;
  staged?: boolean;
  size?: number;
}

interface LocalRoad {
  id: string;
  name: string;
  type: string;
  location: string;
  dateBuilt: string;
  condition: string;
  lastInspection?: string;
  projectName?: string;
  projectCategory?: string;
  projectDescription?: string;
  dateStarted?: string;
  targetCompletionDate?: string;
  noOfExtensions?: string;
  actualCompletionDate?: string;
  roadNetworkId?: string;
  roadName?: string;
  barangay?: string;
  components?: string;
  description?: string;
  contractorName?: string;
  contractorAddress?: string;
  contactInformation?: string;
  pcadLicenseNo?: string;
  sourceOfFunds?: string;
  appropriation?: string;
  contractedAmount?: string;
  adjustProjectCost?: string;
  completionDate?: string;
  completionPercentage?: string;
  turnoverDate?: string;
  attachments?: ProjectAttachment[];
}

interface ProjectFormData {
  projectName: string;
  projectCategory: string;
  projectDescription: string;
  location: string;
  dateStarted: string;
  targetCompletionDate: string;
  noOfExtensions: string;
  actualCompletionDate: string;
  roadNetworkId: string;
  roadName: string;
  barangay: string;
  components: string;
  description: string;
  contractorName: string;
  contractorAddress: string;
  contactInformation: string;
  pcadLicenseNo: string;
  sourceOfFunds: string;
  appropriation: string;
  contractedAmount: string;
  adjustProjectCost: string;
  completionDate: string;
  completionPercentage: string;
  turnoverDate: string;
  attachments: File[];
}

interface LocalRoadFormProps {
  item?: LocalRoad | null;
  editId?: string;
  onSave: (item: Omit<LocalRoad, 'id'> & { id?: string }) => void | Promise<void>;
  onClose: () => void;
}

const projectCategories = [
  'National Road',
  'Provincial Road',
  'City Road',
  'Municipal Road',
  'Barangay Road',
  'Other Specify',
];

const localRoadFormTabs = [
  { id: 'project', label: 'Project Info' },
  { id: 'road', label: 'Road Info' },
  { id: 'contractor', label: 'Contractor Info' },
  { id: 'financial', label: 'Financial Info' },
  { id: 'turnover', label: 'Turnover Info' },
] as const;

const getInitialFormData = (road?: LocalRoad | null): ProjectFormData => ({
  projectName: road?.projectName || road?.name || '',
  projectCategory: road?.projectCategory || road?.type || '',
  projectDescription: road?.projectDescription || road?.description || '',
  location: road?.location || '',
  dateStarted: road?.dateStarted || road?.dateBuilt || '',
  targetCompletionDate: road?.targetCompletionDate || '',
  noOfExtensions: road?.noOfExtensions || '',
  actualCompletionDate: road?.actualCompletionDate || '',
  roadNetworkId: road?.roadNetworkId || '',
  roadName: road?.roadName || road?.name || '',
  barangay: road?.barangay || '',
  components: road?.components || '',
  description: road?.description || '',
  contractorName: road?.contractorName || '',
  contractorAddress: road?.contractorAddress || '',
  contactInformation: road?.contactInformation || '',
  pcadLicenseNo: road?.pcadLicenseNo || '',
  sourceOfFunds: road?.sourceOfFunds || '',
  appropriation: formatSavedProjectCurrency(road?.appropriation),
  contractedAmount: formatSavedProjectCurrency(road?.contractedAmount),
  adjustProjectCost: formatSavedProjectCurrency(road?.adjustProjectCost),
  completionDate: road?.completionDate || '',
  completionPercentage: road?.completionPercentage || '',
  turnoverDate: road?.turnoverDate || '',
  attachments: [],
});

export function LocalRoadForm({ item, editId, onSave, onClose }: LocalRoadFormProps) {
  const [activeFormTab, setActiveFormTab] = useState<(typeof localRoadFormTabs)[number]['id']>('project');
  const [formData, setFormData] = useState<ProjectFormData>(() => getInitialFormData(item));
  const [attachmentNotice, setAttachmentNotice] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [otherCategorySelected, setOtherCategorySelected] = useState(() => Boolean(item?.projectCategory && !projectCategories.includes(item.projectCategory)));

  const [previewFile, setPreviewFile] = useState<{ file: File; url: string } | null>(null);

  const pendingCurrencyCursor = useRef<{ input: HTMLInputElement; position: number } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingCurrencyCursor.current;
    if (pending && document.activeElement === pending.input) {
      pending.input.setSelectionRange(pending.position, pending.position);
    }
    pendingCurrencyCursor.current = null;
  }, [formData]);

  const attachmentsInputRef = useRef<HTMLInputElement>(null);
  const formScrollRef = useRef<HTMLFormElement>(null);
  const projectSectionRef = useRef<HTMLElement>(null);
  const roadSectionRef = useRef<HTMLElement>(null);
  const contractorSectionRef = useRef<HTMLElement>(null);
  const financialSectionRef = useRef<HTMLElement>(null);
  const turnoverSectionRef = useRef<HTMLElement>(null);
  const formSectionRefs = [projectSectionRef, roadSectionRef, contractorSectionRef, financialSectionRef, turnoverSectionRef];

  useEffect(() => {
    if (item) {
      setFormData(getInitialFormData(item));
      setOtherCategorySelected(Boolean(item.projectCategory && !projectCategories.includes(item.projectCategory)));
    }
  }, [item, editId]);

  useEffect(() => {
    formScrollRef.current?.scrollTo({ top: 0 });
    setActiveFormTab('project');
  }, [editId]);

  // Auto-update roadName when location changes
  useEffect(() => {
    if (item) return;
    setFormData(prev => ({
      ...prev,
      roadName: prev.location,
    }));
  }, [formData.location, item]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Native constraint validation displays the browser's message at the first invalid field.
    // Keep whitespace-only text, four-digit years and incomplete amounts invalid too.
    const whitespaceField = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[required]:not([type="file"]), textarea[required]'))
      .find(field => !field.disabled && field.value && !field.value.trim());
    if (whitespaceField) {
      whitespaceField.setCustomValidity('Please fill out this field.');
      whitespaceField.reportValidity();
      return;
    }
    const invalidDate = [
      ['Date Started', formData.dateStarted], ['Target Completion Date', formData.targetCompletionDate],
      ['Actual Completion Date', formData.actualCompletionDate], ['Completion Date', formData.completionDate],
      ['Turnover and Acceptance Date', formData.turnoverDate],
    ].find(([, value]) => !hasFourDigitYear(value));
    const invalidCurrency = [
      ['Appropriation', formData.appropriation], ['Contracted Amount', formData.contractedAmount],
      ['Adjust Project Cost', formData.adjustProjectCost],
    ].find(([, value]) => !isValidProjectCurrency(value));
    const invalidField = invalidDate || invalidCurrency;
    if (invalidField) {
      const input = e.currentTarget.querySelector<HTMLInputElement>(`[data-field="${invalidField[0]}"]`);
      input?.setCustomValidity(invalidDate ? 'Enter a date with a four-digit year.' : 'Enter a valid amount.');
      input?.reportValidity();
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setAttachmentNotice('');
    setIsSubmitting(true);
    const minimumDelay = startProjectSaveDelay();
    try {
      const uploadedAttachments: ProjectAttachment[] = [];
      for (const file of formData.attachments) {
        const problem = attachmentError(file);
        if (problem) throw new Error(problem);
        const response = await fetch('/api/local-road/attachment-upload', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
        });
        const upload = await response.json().catch(() => ({}));
        if (!response.ok || !upload.signedUrl || !upload.path) throw new Error(upload.message || 'Unable to prepare the attachment.');
        const body = new FormData();
        body.append('cacheControl', '3600');
        body.append('file', new Blob([file], { type: upload.type }), file.name);
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const storageResponse = await fetch(upload.signedUrl, {
          method: 'PUT', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, body,
        });
        if (!storageResponse.ok) throw new Error(`Could not upload ${file.name}. Please try again.`);
        uploadedAttachments.push({ name: file.name, type: upload.type, size: file.size, dataUrl: '', category: 'Turnover Certificate', storagePath: upload.path, staged: true });
      }

      const localRoadData = {
        name: formData.projectName,
        type: formData.projectCategory,
        location: formData.location,
        dateBuilt: formData.dateStarted,
        dateStarted: formData.dateStarted,
        condition: 'Good',
        projectName: formData.projectName,
        projectCategory: formData.projectCategory,
        projectDescription: formData.projectDescription,
        targetCompletionDate: formData.targetCompletionDate,
        noOfExtensions: formData.noOfExtensions,
        actualCompletionDate: formData.actualCompletionDate,
        roadNetworkId: formData.roadNetworkId,
        roadName: formData.roadName,
        barangay: formData.barangay,
        components: formData.components,
        description: formData.description,
        contractorName: formData.contractorName,
        contractorAddress: formData.contractorAddress,
        contactInformation: formData.contactInformation,
        pcadLicenseNo: formData.pcadLicenseNo,
        sourceOfFunds: formData.sourceOfFunds,
        appropriation: formData.appropriation.replace(/,/g, ''),
        contractedAmount: formData.contractedAmount.replace(/,/g, ''),
        adjustProjectCost: formData.adjustProjectCost.replace(/,/g, ''),
        completionDate: formData.completionDate,
        completionPercentage: formData.completionPercentage,
        turnoverDate: formData.turnoverDate,
        attachments: [...(item?.attachments || []), ...uploadedAttachments],
      };
      await onSave(editId ? { ...localRoadData, id: editId } : localRoadData);
      await minimumDelay;
      onClose();
    } catch (error) {
      await minimumDelay;
      setAttachmentNotice(error instanceof Error ? error.message : 'Unable to save the project. Please try again.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'attachments') => {
    const newFiles = Array.from(e.target.files || []);
    const problem = newFiles.map(attachmentError).find(Boolean);
    if (problem) {
      setAttachmentNotice(problem);
      e.target.value = '';
      return;
    }
    setAttachmentNotice('');
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], ...newFiles],
    }));
    // Reset the input value so user can select the same files again
    e.target.value = '';
  };

  const removeFile = (field: 'attachments', index: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const handleCurrencyChange = (field: 'appropriation' | 'contractedAmount' | 'adjustProjectCost', input: HTMLInputElement) => {
    const { value, selectionStart } = input;
    const formatted = formatProjectCurrency(value);
    if (selectionStart !== null) {
      pendingCurrencyCursor.current = { input, position: formatProjectCurrency(value.slice(0, selectionStart)).length };
    }
    setFormData(prev => ({ ...prev, [field]: formatted }));
  };

  const handleInputChange = (field: keyof ProjectFormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFilePreview = (file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewFile({ file, url });
  };

  const closePreview = () => {
    if (previewFile) {
      URL.revokeObjectURL(previewFile.url);
    }
    setPreviewFile(null);
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/');
  };

  const moveToFormTab = (index: number) => {
    const scrollContainer = formScrollRef.current;
    const section = formSectionRefs[index].current;
    if (scrollContainer && section) {
      const top = section.getBoundingClientRect().top
        - scrollContainer.getBoundingClientRect().top
        + scrollContainer.scrollTop;
      scrollContainer.scrollTo({ top, behavior: 'smooth' });
    }
    setActiveFormTab(localRoadFormTabs[index].id);
  };
  const updateActiveFormTab = () => {
    const scrollTop = formScrollRef.current?.getBoundingClientRect().top ?? 0;
    const currentIndex = formSectionRefs.reduce((activeIndex, sectionRef, index) => (
      sectionRef.current && sectionRef.current.getBoundingClientRect().top <= scrollTop + 110
        ? index
        : activeIndex
    ), 0);
    setActiveFormTab(localRoadFormTabs[currentIndex].id);
  };

  return (
    <div className="module-form-backdrop fixed inset-0 bg-slate-950/55 backdrop-blur-md flex items-center justify-center z-[9999] p-4 overflow-auto">
      <div className="module-form-panel bg-white rounded-2xl shadow-2xl w-full max-w-[840px] h-[min(560px,calc(100vh-48px))] relative z-[10000] overflow-hidden flex flex-col">
        <div className="flex min-h-[68px] shrink-0 justify-between items-center px-6 py-3 border-b bg-gradient-to-r from-blue-700 to-blue-600">
          <div>
            <h2 className="text-xl font-bold text-white">
              {editId ? 'Edit Local Road Project' : 'Local Road Project Information'}
            </h2>
            <p className="text-sm text-blue-100">Municipal Engineering Office · Infrastructure Encoder Entry</p>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} className="text-gray-300 hover:text-white disabled:opacity-50" aria-label="Close form">
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex shrink-0 gap-2 overflow-x-auto border-b bg-slate-50 px-4 py-2" aria-label="Local road form sections">
          {localRoadFormTabs.map((tab, index) => (
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

        <form
          ref={formScrollRef}
          onSubmit={handleSubmit}
          onInvalidCapture={(event) => {
            const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (field.validity.valueMissing) field.setCustomValidity('Please fill out this field.');
          }}
          onInputCapture={(event) => {
            const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (!('setCustomValidity' in field)) return;
            const textField = field instanceof HTMLTextAreaElement || (field instanceof HTMLInputElement && field.type === 'text');
            field.setCustomValidity(field.required && textField && field.value && !field.value.trim()
              ? 'Please fill out this field.' : '');
          }}
          onChangeCapture={(event) => {
            const field = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
            if (field instanceof HTMLSelectElement || (field instanceof HTMLInputElement && field.type === 'file')) field.setCustomValidity('');
          }}
          onScroll={updateActiveFormTab}
          className="form-modal-fields min-h-0 flex-1 overflow-y-auto px-6 py-5"
        >
          <fieldset disabled={isSubmitting}>
          {/* Project Information */}
          <section ref={projectSectionRef} className="scroll-mt-4 border-b pb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Project Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project / Program / Activity Name *
                </label>
                <AutoGrowTextarea
                  data-field="Project / Program / Activity Name"
                  value={formData.projectName}
                  onChange={(e) => setFormData({ ...formData, projectName: e.target.value })}
                  rows={2}
                  className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Project Category *
                </label>
                <select
                  data-field="Project Category"
                  aria-label="Project category"
                  value={otherCategorySelected ? 'Other Specify' : formData.projectCategory}
                  onChange={(event) => {
                    const value = event.target.value;
                    setOtherCategorySelected(value === 'Other Specify');
                    setFormData({ ...formData, projectCategory: value });
                  }}
                  className="w-full rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  required
                >
                  <option value="">-- Select a Project Category --</option>
                  {projectCategories.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
                {otherCategorySelected && (
                  <textarea
                    value={formData.projectCategory === 'Other Specify' ? '' : formData.projectCategory}
                    onChange={(e) => setFormData({ ...formData, projectCategory: e.target.value || 'Other Specify' })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.shiftKey) {
                        e.preventDefault();
                        const controls = Array.from(
                          e.currentTarget.form?.querySelectorAll<HTMLElement>(
                            'input:not([type="hidden"]), select, textarea, button'
                          ) ?? []
                        ).filter((control) => !control.hasAttribute('disabled') && control.tabIndex >= 0);
                        const nextControl = controls[controls.indexOf(e.currentTarget) + 1];
                        nextControl?.focus();
                      }
                    }}
                    rows={1}
                    placeholder="Specify project category"
                    className="mt-2 w-full resize-none px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                    aria-label="Specify project category"
                    required
                  />
                )}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Project Description *
              </label>
              <AutoGrowTextarea
                data-field="Project Description"
                value={formData.projectDescription}
                onChange={(e) => setFormData({ ...formData, projectDescription: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                rows={3}
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location *
              </label>
              <AutoGrowTextarea
                data-field="Location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                aria-label="Location"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date Started *
                </label>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9999-12-31"
                  data-field="Date Started"
                  value={formData.dateStarted}
                  onChange={(e) => setFormData({ ...formData, dateStarted: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Completion Date *
                </label>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9999-12-31"
                  data-field="Target Completion Date"
                  value={formData.targetCompletionDate}
                  onChange={(e) => setFormData({ ...formData, targetCompletionDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  No. of Extensions
                </label>
                <input
                  type="number"
                  value={formData.noOfExtensions}
                  onChange={(e) => setFormData({ ...formData, noOfExtensions: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Actual Completion Date *
                </label>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9999-12-31"
                  data-field="Actual Completion Date"
                  value={formData.actualCompletionDate}
                  onChange={(e) => setFormData({ ...formData, actualCompletionDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
            </div>

          </section>

          {/* Road Information */}
          <section ref={roadSectionRef} className="scroll-mt-4 border-b pb-6 pt-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Road Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Road Network ID No. *
                </label>
                <AutoGrowTextarea
                  data-field="Road Network ID No."
                  value={formData.roadNetworkId}
                  onChange={(e) => setFormData({ ...formData, roadNetworkId: e.target.value })}
                  rows={2}
                  className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Road Name *
                </label>
                <input
                  type="text"
                  data-field="Road Name"
                  value={formData.roadName}
                  disabled
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed opacity-75"
                  required
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Barangay *
              </label>
              <AutoGrowTextarea
                data-field="Barangay"
                value={formData.barangay}
                onChange={(e) => setFormData({ ...formData, barangay: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Components *
              </label>
              <AutoGrowTextarea
                data-field="Components"
                value={formData.components}
                onChange={(e) => setFormData({ ...formData, components: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description *
              </label>
              <AutoGrowTextarea
                data-field="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                rows={3}
                required
              />
            </div>
          </section>

          {/* Contractor Information */}
          <section ref={contractorSectionRef} className="scroll-mt-4 border-b pb-6 pt-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Contractor Information</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contractor Name *
              </label>
              <AutoGrowTextarea
                data-field="Contractor Name"
                value={formData.contractorName}
                onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contractor Address *
              </label>
              <AutoGrowTextarea
                data-field="Contractor Address"
                value={formData.contractorAddress}
                onChange={(e) => setFormData({ ...formData, contractorAddress: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Contact Information *
              </label>
              <AutoGrowTextarea
                data-field="Contact Information"
                value={formData.contactInformation}
                onChange={(e) => setFormData({ ...formData, contactInformation: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PCAD License No. *
              </label>
              <AutoGrowTextarea
                data-field="PCAD License No."
                value={formData.pcadLicenseNo}
                onChange={(e) => setFormData({ ...formData, pcadLicenseNo: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>
          </section>

          {/* Financial Information */}
          <section ref={financialSectionRef} className="scroll-mt-4 border-b pb-6 pt-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Information</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source of Funds *
              </label>
              <AutoGrowTextarea
                data-field="Source of Funds"
                value={formData.sourceOfFunds}
                onChange={(e) => setFormData({ ...formData, sourceOfFunds: e.target.value })}
                rows={2}
                className="w-full resize-y px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Appropriation *
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#0ea5e9]">
                  <span className="px-4 py-3 bg-gray-100 text-gray-700 font-medium">Php</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-field="Appropriation"
                    value={formData.appropriation}
                    onChange={(e) => handleCurrencyChange('appropriation', e.currentTarget)}
                    className="min-h-[3rem] flex-1 resize-y px-4 py-3 border-0 text-gray-900 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contracted Amount *
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#0ea5e9]">
                  <span className="px-4 py-3 bg-gray-100 text-gray-700 font-medium">Php</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-field="Contracted Amount"
                    value={formData.contractedAmount}
                    onChange={(e) => handleCurrencyChange('contractedAmount', e.currentTarget)}
                    className="min-h-[3rem] flex-1 resize-y px-4 py-3 border-0 text-gray-900 focus:outline-none"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjust Project Cost *
                </label>
                <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-[#0ea5e9]">
                  <span className="px-4 py-3 bg-gray-100 text-gray-700 font-medium">Php</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    data-field="Adjust Project Cost"
                    value={formData.adjustProjectCost}
                    onChange={(e) => handleCurrencyChange('adjustProjectCost', e.currentTarget)}
                    className="min-h-[3rem] flex-1 resize-y px-4 py-3 border-0 text-gray-900 focus:outline-none"
                    required
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Completion and Turnover Information */}
          <section ref={turnoverSectionRef} className="scroll-mt-4 border-b pb-6 pt-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Completion and Turnover Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Completion Date *
                </label>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9999-12-31"
                  data-field="Completion Date"
                  value={formData.completionDate}
                  onChange={(e) => setFormData({ ...formData, completionDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Completion Percentage *
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  data-field="Completion Percentage"
                  value={formData.completionPercentage}
                  onChange={(e) => setFormData({ ...formData, completionPercentage: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Turnover and Acceptance Date *
                </label>
                <input
                  type="date"
                  min="1000-01-01"
                  max="9999-12-31"
                  data-field="Turnover and Acceptance Date"
                  value={formData.turnoverDate}
                  onChange={(e) => setFormData({ ...formData, turnoverDate: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attachment * {formData.attachments.length > 0 && `(${formData.attachments.length} file${formData.attachments.length > 1 ? 's' : ''} selected)`}
              </label>
              
              {item?.attachments?.filter(attachment => attachment.category === 'Turnover Certificate').map((attachment, index) => (
                <p key={`${attachment.storagePath || attachment.name}-${index}`} className="mb-2 text-sm text-gray-600">Existing attachment: {attachment.name}</p>
              ))}
              {attachmentNotice && <p role="alert" className="mb-2 text-sm text-red-600">{attachmentNotice}</p>}
              {formData.attachments.length === 0 ? (
                <>
                  <input
                    type="file"
                    data-field="Turnover Attachment"
                    aria-required={true}
                    required={!item?.attachments?.some(attachment => attachment.category === 'Turnover Certificate')}
                    multiple
                    onChange={(e) => handleFileChange(e, 'attachments')}
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#0ea5e9] focus:border-transparent text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported File Format: PDF, JPG, PNG | Max File Size: 10 MB
                  </p>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => attachmentsInputRef.current?.click()}
                  className="w-full px-4 py-3 bg-blue-50 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                >
                  + Add More Files
                </button>
              )}
              
              <input
                ref={attachmentsInputRef}
                type="file"
                multiple
                onChange={(e) => handleFileChange(e, 'attachments')}
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
              />

              {formData.attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm font-medium text-gray-700">Selected Files:</p>
                  {formData.attachments.map((file, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                      <button
                        type="button"
                        onClick={() => handleFilePreview(file)}
                        className="text-left flex-1 text-sm text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        {isImageFile(file) && '🖼️ '}{file.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeFile('attachments', index)}
                        className="text-red-600 hover:text-red-800 text-sm ml-2"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="disabled:opacity-50 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <span aria-live="polite">{isSubmitting ? (editId ? 'Updating…' : 'Saving…') : 'Submit'}</span>
            </button>
          </div>
          </fieldset>
        </form>

        {/* File Preview Modal */}
        {previewFile && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-auto relative">
              <button
                onClick={closePreview}
                className="sticky top-0 right-0 p-3 bg-red-600 text-white hover:bg-red-700 rounded-full float-right"
              >
                <X className="w-6 h-6" />
              </button>
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-900 mb-4 break-all">{previewFile.file.name}</h3>
                {isImageFile(previewFile.file) ? (
                  <img
                    src={previewFile.url}
                    alt="Preview"
                    className="w-full max-h-[60vh] object-contain rounded-lg"
                  />
                ) : (
                  <div className="bg-gray-100 p-8 rounded-lg text-center">
                    <p className="text-gray-600 mb-4">📄 PDF File</p>
                    <p className="text-sm text-gray-500 mb-6">PDFs cannot be previewed in the browser</p>
                    <button
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = previewFile.url;
                        link.download = previewFile.file.name;
                        link.click();
                      }}
                      className="px-6 py-2 bg-[#0ea5e9] text-white rounded-lg hover:bg-[#0284c7] transition-colors font-medium mb-4"
                    >
                      ⬇️ Download PDF
                    </button>
                    <p className="text-xs text-gray-400 mt-4">File size: {(previewFile.file.size / 1024).toFixed(2)} KB</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
