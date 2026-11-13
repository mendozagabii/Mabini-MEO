import { useRef, useState } from 'react';
import { Plus, Edit, Trash2, Search, MapPin, Download, Paperclip, Printer, ClipboardCheck, CalendarDays } from 'lucide-react';
import { AutoGrowTextarea } from './ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ConfirmActionDialog } from './ConfirmActionDialog';
import { PrintDocument, type PrintSection } from './PrintDocument';
import { recordClientActivity } from '@/lib/activity-log-client';
import { hasPassedValidation, isValidationLocked, latestValidation, validationTask } from '@/lib/project-validation-workflow';
import { formatSavedProjectCurrency } from '@/lib/project-form-validation';

interface ProjectAttachment {
  name: string;
  type: string;
  dataUrl: string;
  category: string;
  // @mine — Supabase Storage path for the file (Phase 2, 2026-11-09);
  // optional so records created before Storage still type-check.
  storagePath?: string;
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
  // @mine — task 12: up to five free-text coverage locations.
  locations?: string[];
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

  sourceOfFunds?: string;
  appropriation?: string;
  contractedAmount?: string;

  completionDate?: string;

  turnoverDate?: string;
  attachments?: ProjectAttachment[];
  validationResult?: 'Validated' | 'Return for Revision';
  validationRemarks?: string;
  annualInspectionYears?: number[];
  // @mine — the assigned inspector (task 11).
  inspectorId?: string;
  annualValidationEntries?: Array<{
    year: number;
    dueDate: string;
    result: 'Pending' | 'Validated' | 'Return for Revision';
    remarks: string;
    validatedAt?: string;
  }>;
}

interface LocalRoadListProps {
  data: LocalRoad[];
  onAdd: () => void;
  onEdit: (item: LocalRoad) => void;
  onDelete: (id: string) => void;
  validationMode?: boolean;
  validatorName?: string;
  currentUser: string;
  onSaveValidation?: (id: string, result: 'Validated' | 'Return for Revision', remarks: string, annualYear?: number) => Promise<boolean>;
  userRole?: string;
  // @mine — task 11: the Head Engineer assigns one inspector per project from the list.
  inspectors?: Array<{ id: string; name: string }>;
  onAssignInspector?: (projectId: string, inspectorId: string) => Promise<unknown> | unknown;
}

export function LocalRoadList({ data, onAdd, onEdit, onDelete, validationMode = false, validatorName = '', currentUser, onSaveValidation, userRole = '', inspectors = [], onAssignInspector }: LocalRoadListProps) {
  // @mine — Head Engineer is the actual session label for the Admin role.
  const isAdminReadDeleteOnly = ['Admin', 'Head Engineer'].includes(userRole) && !validationMode;
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLocation, setFilterLocation] = useState('All');
  // @mine — task 13: project management filters by completion date, not by location.
  const [filterCompletionDate, setFilterCompletionDate] = useState('');
  const filterDateRef = useRef<HTMLInputElement>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const usesDateFilter = validationMode || ['Staff - Encoder', 'Head Engineer', 'Admin'].includes(userRole);
  const showsAssignTable = !validationMode && userRole === 'Head Engineer';
  const [selectedSnapshot, setSelectedItem] = useState<LocalRoad | null>(null);
  const selectedItem = selectedSnapshot ? data.find(item => item.id === selectedSnapshot.id) ?? selectedSnapshot : null;
  const [pendingDelete, setPendingDelete] = useState<LocalRoad | null>(null);
  const [selectedAttachment, setSelectedAttachment] = useState<ProjectAttachment | null>(null);
  const [validationResult, setValidationResult] = useState<'Validated' | 'Return for Revision' | ''>('');
  const [validationRemarks, setValidationRemarks] = useState('');
  const [savingValidation, setSavingValidation] = useState(false);
  const savingValidationRef = useRef(false);
  const [selectedValidationYear, setSelectedValidationYear] = useState<number | null>(null);
  const [printSections, setPrintSections] = useState<PrintSection[] | null>(null);
  const canPrint = ['Admin', 'Head Engineer', 'Staff - Encoder'].includes(userRole);
  // @mine — task 12: the coverage lines read as one box with one line per location,
  // falling back to a legacy single value when a record predates the coverage table.
  const locationLines = (item: LocalRoad): string[] =>
    (item.locations?.length ? item.locations : String(item.location || '').split('\n'))
      .map((line) => String(line ?? '').trim())
      .filter(Boolean);

  const printSelectedProject = (item: LocalRoad) => {
    void recordClientActivity(
      currentUser,
      'Print Requested',
      `Requested print for project ${item.projectName || item.name}`,
    ).catch((error: unknown) => console.error('Failed to record project print activity.', error));
    setPrintSections([
      {
        title: 'Project Information',
        fields: [
          { label: 'Project / Program / Activity Name', value: item.projectName || item.name, width: 'half' },
          { label: 'Project Category', value: item.projectCategory || item.type, width: 'half' },
          { label: 'Project Description', value: item.projectDescription || item.description, width: 'full' },
          { label: 'Location', value: locationLines(item).join('\n'), width: 'full' },
          { label: 'Date Started', value: item.dateBuilt, width: 'quarter' },
          { label: 'Target Completion Date', value: item.targetCompletionDate, width: 'quarter' },
          { label: 'No. of Extensions', value: Number(item.noOfExtensions) === 0 ? '' : item.noOfExtensions, width: 'quarter' },
          { label: 'Actual Completion Date', value: item.actualCompletionDate, width: 'quarter' },
        ],
      },
      {
        title: 'Road Information',
        fields: [
          // @mine — task 12: the road network id and the road name get a row each.
          { label: 'Road Network ID No.', value: item.roadNetworkId, width: 'full' },
          { label: 'Road Name', value: locationLines(item).join('\n') || item.roadName, width: 'full' },
          { label: 'Barangay', value: item.barangay, width: 'full' },
          { label: 'Components', value: item.components, width: 'full' },
          { label: 'Description', value: item.description, width: 'full' },
        ],
      },
      {
        title: 'Contractor Information',
        fields: [
          { label: 'Contractor Name', value: item.contractorName, width: 'full' },
          { label: 'Contractor Address', value: item.contractorAddress, width: 'full' },
          { label: 'Contact Information', value: item.contactInformation, width: 'full' },
        ],
      },
      {
        title: 'Financial Information',
        fields: [
          { label: 'Source of Funds', value: item.sourceOfFunds, width: 'full' },
          { label: 'Approved Budget for the Contract (ABC)', value: item.appropriation ? `Php ${formatSavedProjectCurrency(item.appropriation)}` : undefined, width: 'half' },
          { label: 'Contracted Amount', value: item.contractedAmount ? `Php ${formatSavedProjectCurrency(item.contractedAmount)}` : undefined, width: 'half' },
        ],
      },
      {
        title: 'Completion and Turnover Information',
        fields: [
          { label: 'Completion Date', value: item.completionDate, width: 'half' },
          { label: 'Turnover and Acceptance Date', value: item.turnoverDate, width: 'half' },
          { label: 'Condition', value: item.condition },
          { label: 'Last Inspection', value: item.lastInspection },
          { label: 'Validation Result', value: latestValidation(item).result && latestValidation(item).result !== 'Pending' ? latestValidation(item).result : 'Pending Validation' },
          { label: 'Validation Remarks', value: latestValidation(item).remarks },
        ],
      },
    ]);
  };

  const filteredData = data.filter(item => {
    const query = searchTerm.trim().toLowerCase();
    const date = showsAssignTable ? (item.actualCompletionDate || item.completionDate || '') : (item.dateBuilt || '');
    const task = validationTask(item);
    const searchValues = validationMode
      ? [item.projectName || item.name, task?.result || 'Pending', task?.year ? `Annual ${task.year}` : '', item.barangay || 'N/A', item.dateBuilt, item.condition, item.lastInspection || 'N/A']
      : showsAssignTable
      ? [item.projectName || item.name, item.barangay || 'N/A', item.contractedAmount && `Php ${formatSavedProjectCurrency(item.contractedAmount)}`, date, inspectors.find(person => person.id === item.inspectorId)?.name || (hasPassedValidation(item) ? 'Not assigned' : 'Awaiting validation')]
      : [item.projectName || item.name, item.barangay || 'Location not set', item.dateBuilt || 'Not set', item.lastInspection || 'Not recorded', latestValidation(item).result === 'Return for Revision' ? 'For Revision' : ''];
    const matchesSearch = searchValues.some(value => String(value ?? '').toLowerCase().includes(query));
    const matchesDate = !usesDateFilter || !filterCompletionDate || date === filterCompletionDate;
    const matchesLocation = usesDateFilter || filterLocation === 'All' || (item.barangay || item.location) === filterLocation;
    const isEligibleForValidation = !validationMode || validationTask(item) !== null;
    return matchesSearch && matchesLocation && matchesDate && isEligibleForValidation;
  });

  const locations = [
    'All',
    'Anilao Proper',
    'Anilao East',
    'Bagalangit',
    'Bulacan',
    'Calamias',
    'Estrella',
    'Gasang',
    'Laurel',
    'Ligaya',
    'Mainaga',
    'Mainit',
    'Majuben',
    'Malimatoc I',
    'Malimatoc II',
    'Nag-Iba',
    'Pilahan',
    'Poblacion',
    'Pulang Lupa',
    'Pulong Anahao',
    'Pulong Balibaguhan',
    'Pulong Niogan',
    'Saguing',
    'Sampaguita',
    'San Francisco',
    'San Jose',
    'San Juan',
    'San Teodoro',
    'Santa Ana',
    'Santa Mesa',
    'Santo Niño',
    'Santo Tomas',
    'Solo',
    'Talaga Proper',
    'Talaga East',
  ];
  const selectedDetails = (
    <>
    <Dialog
      open={selectedItem !== null}
      onOpenChange={(open) => {
        if (!open && !savingValidationRef.current) {
          setSelectedItem(null);
          setSelectedAttachment(null);
          setValidationResult('');
          setValidationRemarks('');
        }
      }}
    >
      {selectedItem && (
        <DialogContent className="project-details-dialog card-details-dialog max-h-[min(620px,calc(100vh-32px))] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl sm:max-w-[790px]">
          <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 pr-14 text-white">
            <div>
              <DialogTitle className="text-xl font-bold text-white">{selectedItem.projectName || selectedItem.name}</DialogTitle>
              <DialogDescription className="text-sm text-blue-100">Municipal Engineering Office · Infrastructure Encoder Entry</DialogDescription>
            </div>
          </div>
          <div className="max-h-[calc(min(620px,100vh-32px)-76px)] overflow-y-auto px-6 pb-8 pt-5">
            <div className="space-y-0">
            <section className="border-b pb-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Project Information</h3>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Project / Program / Activity Name</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.projectName || selectedItem.name || ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Project Category</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.projectCategory || selectedItem.type || ''}</p>
            </div>
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 block text-sm font-medium text-gray-700">Project Description</p>
              <p className="min-h-[5rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">
                {selectedItem.projectDescription || selectedItem.description || ''}
              </p>
            </div>
            <div className="mb-4 mt-4">
              <p className="mb-2 block text-sm font-medium text-gray-700">Location</p>
              {/* @mine — task 12: one box, one line per coverage location. */}
              <p data-field="Location" className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{locationLines(selectedItem).join('\n')}</p>
            </div>
            <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
              {[
                ['Date Started', selectedItem.dateBuilt],
                ['Target Completion Date', selectedItem.targetCompletionDate],
                ['No. of Extensions', Number(selectedItem.noOfExtensions) === 0 ? '' : selectedItem.noOfExtensions],
                ['Actual Completion Date', selectedItem.actualCompletionDate],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="mb-2 block text-sm font-medium text-gray-700">{label}</p>
                  <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{value || ''}</p>
                </div>
              ))}
            </div>
            </section>
            <section className="border-b pb-6 pt-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Road Information</h3>
              {/* @mine — task 12: Road Network ID No. and Road Name each on their own row. */}
              <div className="mb-4 grid grid-cols-1 gap-4">
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Road Network ID No.</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.roadNetworkId || ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Road Name</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{locationLines(selectedItem).join('\n') || selectedItem.roadName || ''}</p>
            </div>
              </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Barangay</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.barangay || ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Components</p>
              <p className="min-h-[5rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.components || ''}</p>
            </div>
            <div className="mt-4">
              <p className="mb-2 block text-sm font-medium text-gray-700">Description</p>
              <p className="min-h-[5rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.description || ''}</p>
            </div>
            </section>
            <section className="border-b pb-6 pt-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Contractor Information</h3>
              <div className="grid grid-cols-1 gap-4">
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Contractor Name</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.contractorName || ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Contractor Address</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.contractorAddress || ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Contact Information</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.contactInformation || ''}</p>
            </div>
              </div>
            </section>
            <section className="border-b pb-6 pt-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Financial Information</h3>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Source of Funds</p>
              <p className="min-h-[3rem] w-full whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.sourceOfFunds || ''}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Approved Budget for the Contract (ABC)</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.appropriation ? `Php ${formatSavedProjectCurrency(selectedItem.appropriation)}` : ''}</p>
            </div>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Contracted Amount</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.contractedAmount ? `Php ${formatSavedProjectCurrency(selectedItem.contractedAmount)}` : ''}</p>
            </div>
            </div>
            </section>
            <section className="border-b pb-6 pt-5">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">Completion and Turnover Information</h3>
            <div>
              <p className="mb-2 block text-sm font-medium text-gray-700">Completion Date</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.completionDate || ''}</p>
            </div>
            <div className="mt-4">
              <p className="mb-2 block text-sm font-medium text-gray-700">Turnover and Acceptance Date</p>
              <p className="min-h-[3rem] w-full rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.turnoverDate || ''}</p>
            </div>
            <div className="project-attachments-section mt-5 border-t border-slate-200 pb-5 pt-5">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
                <Paperclip className="h-3.5 w-3.5" />
                Submitted Attachments
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {selectedItem.attachments?.length ? selectedItem.attachments.map((attachment, index) => (
                  <div key={`${attachment.name}-${index}`} className="overflow-hidden rounded-lg border border-gray-300 bg-gray-100">
                    {attachment.type.startsWith('image/') && (
                      <button
                        type="button"
                        onClick={() => setSelectedAttachment(attachment)}
                        className="block w-full cursor-zoom-in"
                        aria-label={`Preview ${attachment.name}`}
                      >
                        <img src={attachment.dataUrl} alt="" className="h-28 w-full object-cover" />
                      </button>
                    )}
                    <div className="flex items-center justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedAttachment(attachment)}
                          className="block max-w-full truncate text-left text-sm font-medium text-blue-700 hover:underline"
                          title={`Preview ${attachment.name}`}
                        >
                          {attachment.name}
                        </button>
                        <p className="mt-1 text-xs text-slate-500">{attachment.category} · {attachment.type || 'File'}</p>
                      </div>
                      <a
                        href={attachment.dataUrl}
                        download={attachment.name}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-lg p-2 text-blue-600 hover:bg-blue-100"
                        aria-label={`Download ${attachment.name}`}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                )) : <p className="text-gray-800">No attachments available</p>}
              </div>
            </div>
            </section>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Condition</p>
              <p className="min-h-[3rem] rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.condition || ''}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Last Inspection</p>
              <p className="min-h-[3rem] rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{selectedItem.lastInspection || ''}</p>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">Validation Result</p>
              <p className="min-h-[3rem] rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">{latestValidation(selectedItem).result && latestValidation(selectedItem).result !== 'Pending' ? latestValidation(selectedItem).result : 'Pending Validation'}</p>
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-medium text-gray-700">Validation Remarks</p>
              <p className="min-h-[5rem] whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-100 px-4 py-3 text-gray-700">
                {latestValidation(selectedItem).remarks || ''}
              </p>
            </div>
            </div>
            {canPrint && !validationMode && (
              <div className="mt-5 flex justify-end border-t border-slate-200 pt-5">
                <button type="button" onClick={() => printSelectedProject(selectedItem)} className="inline-flex items-center gap-2 rounded-md bg-blue-700 px-5 py-2 text-sm font-medium text-white hover:bg-blue-800">
                  <Printer className="h-4 w-4" /> Print
                </button>
              </div>
            )}
            {validationMode && (
              <form
                className="validation-entry-form md:col-span-2 border-t border-gray-200 pt-5 space-y-5"
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!validationResult || !validationRemarks.trim() || savingValidationRef.current) return;
                  savingValidationRef.current = true;
                  setSavingValidation(true);
                  try {
                    const saved = await onSaveValidation?.(selectedItem.id, validationResult, validationRemarks, selectedValidationYear ?? undefined);
                    if (saved) setSelectedItem(null);
                  } catch (error) {
                    console.error('Validation save failed.', error);
                    window.alert('Unable to save validation. Please try again.');
                  } finally {
                    savingValidationRef.current = false;
                    setSavingValidation(false);
                  }
                }}
              >
                <fieldset disabled={savingValidation}>
                  <legend className="text-sm font-semibold text-gray-900">Validation Result<span className="text-red-600">*</span></legend>
                  <div className="mt-2 flex w-fit max-w-full flex-nowrap gap-6 overflow-x-auto">
                    {(['Validated', 'Return for Revision'] as const).map(result => (
                      <label key={result} className="inline-flex shrink-0 items-center gap-2 text-sm text-gray-800">
                        <input type="radio" name="validation-result" value={result} checked={validationResult === result} onChange={() => setValidationResult(result)} required className="h-4 w-4 accent-[#0ea5e9]" />
                        {result}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div>
                  <label htmlFor="validation-remarks" className="block text-sm font-semibold text-gray-900">Remarks<span className="text-red-600">*</span></label>
                  <AutoGrowTextarea disabled={savingValidation} id="validation-remarks" value={validationRemarks} onChange={event => setValidationRemarks(event.target.value)} required className="mt-2 w-full resize-y rounded-md border border-gray-300 px-3 py-2 text-gray-900 focus:border-[#0ea5e9] focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" />
                </div>
                <div className="text-sm text-gray-800">
                  <p>Validated by:</p>
                  <p className="font-bold uppercase">{validatorName}</p>
                  <p>Validator</p>
                </div>
                <div className="flex justify-end gap-3">
                  <button type="button" disabled={savingValidation} onClick={() => setSelectedItem(null)} className="rounded-md border border-gray-300 px-5 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={savingValidation} className="rounded-md bg-[#0ea5e9] px-5 py-2 text-sm font-medium text-white hover:bg-[#0284c7] disabled:opacity-50">
                    <span aria-live="polite">{savingValidation ? (validationResult === 'Return for Revision' ? 'Saving...' : 'Submitting...') : (validationResult === 'Return for Revision' ? 'Save' : 'Submit')}</span>
                  </button>
                </div>
              </form>
            )}
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
    <Dialog open={selectedAttachment !== null} onOpenChange={(open) => !open && setSelectedAttachment(null)}>
      {selectedAttachment && (
        <DialogContent className="max-h-[min(760px,calc(100vh-32px))] overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-800 shadow-2xl sm:max-w-[900px]">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-6 py-4 pr-12 text-white">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-bold text-white">{selectedAttachment.name}</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-blue-100">{selectedAttachment.category} · {selectedAttachment.type || 'File'}</DialogDescription>
            </div>
          </div>
          <div className="flex max-h-[calc(min(760px,100vh-32px)-84px)] min-h-[320px] items-center justify-center overflow-auto bg-slate-100 p-6">
            {selectedAttachment.type.startsWith('image/') ? (
              <img src={selectedAttachment.dataUrl} alt={selectedAttachment.name} className="max-h-[min(620px,calc(100vh-160px))] max-w-full object-contain" />
            ) : (
              <iframe src={selectedAttachment.dataUrl} title={selectedAttachment.name} className="h-[min(620px,calc(100vh-160px))] w-full rounded-lg border border-slate-200 bg-white" />
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
    </>
  );

  return (
    <>
    {printSections && <PrintDocument title="Local Road Project Information" sections={printSections} onComplete={() => setPrintSections(null)} />}
    {selectedDetails}
    <ConfirmActionDialog
      open={pendingDelete !== null}
      onOpenChange={(open) => {
        if (!open) setPendingDelete(null);
      }}
      title="Delete road project?"
      description={`Archive ${pendingDelete?.projectName || pendingDelete?.name || 'this road'}? It can be restored from System Management.`}
      onConfirm={() => {
        if (pendingDelete) onDelete(pendingDelete.id);
        setPendingDelete(null);
      }}
    />
    <div className="flex min-h-screen flex-col gap-6 bg-[#E3EEF9] p-6">
      <div className="flex justify-between items-center">
        <div>
            <h1 className="text-xl font-semibold tracking-tight text-blue-700">{validationMode ? 'Validation Management' : 'Local Road Management'}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {validationMode
                ? 'Project data verification, information review, and validation records.'
                : 'Road project information, implementation details, and completion records.'}
            </p>
        </div>
        <div className="flex items-center gap-3">
          {!validationMode && !isAdminReadDeleteOnly && <button
            onClick={onAdd}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 font-semibold text-white shadow-md transition hover:brightness-105"
          >
            <Plus className="w-5 h-5" />
            Add Local Road
          </button>}
        </div>
      </div>

      <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <label className="relative block min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search by name or location"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {usesDateFilter ? (
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <label className="relative flex-1 sm:flex-none">
                <span className="sr-only">Filter by project completion date</span>
                <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                <input
                  type="date"
                  aria-label={validationMode ? 'Filter validation by date' : 'Filter by project completion date'}
                  ref={filterDateRef}
                  min="1000-01-01"
                  max="9999-12-31"
                  onChange={(event) => { if (event.currentTarget.value && event.currentTarget.validity.valid) setFilterCompletionDate(event.currentTarget.value); }}
                  onBlur={(event) => { if (!event.currentTarget.value) setFilterCompletionDate(''); }}
                  className="h-auto min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 sm:w-[240px]"
                />
              </label>
              {filterCompletionDate && (
                <button type="button" onClick={() => { if (filterDateRef.current) filterDateRef.current.value = ''; setFilterCompletionDate(''); }} className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-900">Clear</button>
              )}
            </div>
          ) : (
            <Select value={filterLocation} onValueChange={setFilterLocation}>
              <SelectTrigger aria-label="Filter by location" className="relative h-auto min-h-[46px] w-full min-w-[220px] pl-10 pr-4 py-3 sm:w-[280px] sm:shrink-0">
                <MapPin aria-hidden="true" className="absolute left-4 h-4 w-4 text-blue-500" />
                <SelectValue>Location: {filterLocation}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {locations.map(location => (
                  <SelectItem key={location} value={location}>{location}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 py-1">
        <div>
          <h2 className="flex items-center gap-3 text-2xl font-bold text-blue-700">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            {validationMode ? 'Validation History' : 'Local Road Projects'}
          </h2>
        </div>
        <span className="text-sm text-slate-500">{filteredData.length} records listed</span>
      </div>

        {validationMode ? (
          <div className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full border-separate border-spacing-0">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Project Name</th>
                  <th className="px-6 py-3 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Validation Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Location</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Date Built</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Condition</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Last Inspection</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {filteredData.map(item => {
                  const task = validationTask(item);
                  const status = task?.result || 'Pending';
                  return (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    aria-label={`Open validation form for ${item.name}`}
                    onClick={() => {
                      setSelectedItem(item);
                      setSelectedValidationYear(task?.year ?? null);
                      setValidationResult(task?.result || '');
                      setValidationRemarks(task?.result === 'Return for Revision' ? task.remarks || '' : '');
                    }}
                    onKeyDown={(event) => {
                      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        setSelectedItem(item);
                        setSelectedValidationYear(task?.year ?? null);
                        setValidationResult(task?.result || '');
                        setValidationRemarks(task?.result === 'Return for Revision' ? task.remarks || '' : '');
                      }
                    }}
                    className="cursor-pointer hover:bg-blue-50/60 focus:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                  >
                    <td className="whitespace-nowrap px-6 py-4">
                      {/* @mine — task 16: the validation table names the project, not the road. */}
                      <span className="font-medium text-[#0ea5e9]">
                        {item.projectName || item.name || item.roadName || 'N/A'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                        status === 'Validated' ? 'bg-green-100 text-green-800' :
                        status === 'Return for Revision' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {status}{task?.year ? ` · Annual ${task.year}` : ''}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <MapPin className="h-4 w-4" />
                        <span>{item.barangay || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{item.dateBuilt}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{item.condition}</td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">{item.lastInspection || 'N/A'}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredData.length === 0 && (
              <div className="py-12 text-center text-gray-500">No local road found matching your criteria.</div>
            )}
          </div>
        ) : (
          <>
            {/* @mine — task 11: the Head Engineer sees a table and assigns an inspector per row. */}
            {showsAssignTable ? (
              <div className="min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Project Name</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Contract Amount</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Completion Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-slate-600">Inspector</th>
                      <th className="px-2 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {filteredData.map(item => (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        aria-label={`View details for ${item.projectName || item.name}`}
                        onClick={() => setSelectedItem(item)}
                        onKeyDown={(event) => {
                          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            setSelectedItem(item);
                          }
                        }}
                        className="cursor-pointer hover:bg-blue-50/60 focus:outline-none focus-visible:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400"
                      >
                        <td className="px-6 py-4">
                          <span className="font-medium text-[#0ea5e9]">{item.projectName || item.name || 'N/A'}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{item.barangay || 'N/A'}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {item.contractedAmount ? `Php ${formatSavedProjectCurrency(item.contractedAmount)}` : 'N/A'}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {item.actualCompletionDate || item.completionDate || 'N/A'}
                        </td>
                        <td className="px-6 py-4" onClick={(event) => event.stopPropagation()}>
                          <select
                            aria-label={`Assign inspector for ${item.projectName || item.name}`}
                            value={item.inspectorId || ''}
                            // @mine — the officer's flow: only a validated project can take an inspector.
                            disabled={!onAssignInspector || assigningId === item.id || !hasPassedValidation(item)}
                            title={hasPassedValidation(item) ? undefined : 'Assign an inspector once the project is validated'}
                            onChange={async (event) => {
                              if (!onAssignInspector) return;
                              setAssigningId(item.id);
                              try { await onAssignInspector(item.id, event.target.value); }
                              finally { setAssigningId(null); }
                            }}
                            className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700 disabled:bg-gray-100"
                          >
                            <option value="">{hasPassedValidation(item) ? 'Not assigned' : 'Awaiting validation'}</option>
                            {inspectors.map(inspector => (
                              <option key={inspector.id} value={inspector.id}>{inspector.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="w-12 px-2 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                          {['Admin', 'Head Engineer'].includes(userRole) && (
                            <button
                              type="button"
                              onClick={() => setPendingDelete(item)}
                              aria-label={`Delete ${item.projectName || item.name}`}
                              title="Delete"
                              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredData.length === 0 && (
                  <div className="py-12 text-center text-gray-500">No project found matching your criteria.</div>
                )}
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredData.map((item, index) => (
                  <article key={item.id} className="road-project-card group flex min-h-[150px] flex-col rounded-[22px] border border-slate-200 bg-white p-3 text-slate-800 shadow-sm transition hover:border-blue-300 hover:shadow-[0_0_0_3px_rgba(96,165,250,0.22),0_10px_25px_rgba(30,64,175,0.12)]">
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`View details for ${item.projectName || item.name}`}
                    >
                    <div className="flex w-full items-center justify-between gap-3 text-sm leading-5 text-slate-700">
                      <span className="truncate">Road {filteredData.length - index}</span>
                      <span className="shrink-0 text-right">{item.dateBuilt || 'Not set'}</span>
                    </div>
                    <div className="mt-2 space-y-1 text-sm leading-5">
                      <div>
                        <p className="truncate text-base font-bold text-slate-800" title={item.projectName || item.name}>{item.projectName || item.name || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="mt-0.5 flex items-start gap-1.5 text-sm text-slate-600">
                          <MapPin className="h-4 w-4 shrink-0" />
                          <span>{item.barangay || 'Location not set'}</span>
                        </p>
                      </div>
                    </div>
                    </button>
                    <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-200 pt-2 text-sm">
                      <span className="truncate text-slate-500">
                        Inspection: {item.lastInspection || 'Not recorded'}
                      </span>
                      <div className="flex shrink-0 items-center gap-3">
                        {userRole === 'Staff - Encoder' && latestValidation(item).result === 'Return for Revision' && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">For Revision</span>
                        )}
                        {!isAdminReadDeleteOnly && (() => {
                          // @mine — task 3: a validated project is locked until the next cycle opens.
                          const locked = userRole === 'Staff - Encoder' ? isValidationLocked(item) : null;
                          return locked ? (
                            <span
                              className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
                              title={`Validated for ${locked.year}. It can be edited again when the next annual validation opens.`}
                            >
                              Validated
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onEdit(item)}
                              aria-label={`Edit ${item.projectName || item.name}`}
                              title="Edit"
                              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </button>
                          );
                        })()}
                        {['Admin', 'Head Engineer'].includes(userRole) && <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          aria-label={`Delete ${item.projectName || item.name}`}
                          title="Delete"
                          className="rounded-md p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>}
                      </div>
                    </div>
                  </article>
              ))}
              {filteredData.length === 0 && (
                <div className="col-span-full rounded-[22px] border border-slate-200 bg-white px-6 py-10 text-center text-slate-500">
                  No local road found matching your criteria.
                </div>
              )}
            </div>
            )}
          </>
        )}
      <div className="mb-10 mt-auto flex flex-col gap-2 border-t border-slate-200 px-1 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          Showing {filteredData.length} of {data.length} total {validationMode ? 'validation projects' : 'registered road projects'}
        </span>
        <span className="font-medium text-blue-700">Municipality of Mabini, Batangas</span>
      </div>
    </div>
    </>
  );
}
