'use client';
import { loadRecords } from '@/lib/load-records';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const IDLE_WARNING_MS = 30 * 1000;
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { SESSION_EXPIRED_EVENT, installSessionExpiryHandler } from '@/lib/session-expiry';
import { Dashboard } from './components/Dashboard';
import { LocalRoadList } from './components/LocalRoadList';
import { LocalRoadForm } from './components/LocalRoadForm';
import { InspectionModule } from './components/InspectionModule';
import { MaintenanceModule } from './components/MaintenanceModule';
import { AIPredictionModule, type PredictionResult } from './components/AIPredictionModule';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { UserManagementModule } from './components/UserManagementModule';
import { ProjectProgressModule } from './components/ProjectProgressModule';

interface ProjectAttachment {
  name: string;
  type: string;
  dataUrl: string;
  category: string;
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
  validationResult?: 'Validated' | 'Return for Revision';
  validationRemarks?: string;
  annualValidationEntries?: Array<{
    year: number;
    dueDate: string;
    result: 'Pending' | 'Validated' | 'Return for Revision';
    remarks: string;
    validatedAt?: string;
  }>;
}

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
  // @mine 2026-11-11 — remark + attachments underneath each assessment category.
  conditionRemarks?: Record<string, string>;
  conditionAttachments?: Record<string, Array<{ name: string; type: string; dataUrl: string; storagePath?: string; staged?: boolean; stored?: boolean; size?: number }>>;
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

interface Maintenance {
  id: string;
  inspectionId?: string;
  localRoadId: string;
  localRoadName: string;
  type: string;
  scheduledDate: string;
  completedDate?: string;
  cost: number;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Deferred';
  description: string;
}

const AI_RECOMMENDATIONS_STORAGE_KEY = 'local-road-ai-recommendations';

function isPredictionResult(value: unknown): value is PredictionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (
    'localRoadId' in value && typeof value.localRoadId === 'string' &&
    'localRoadName' in value && typeof value.localRoadName === 'string' &&
    'type' in value && typeof value.type === 'string' &&
    'lastInspection' in value && typeof value.lastInspection === 'string' &&
    'condition' in value && typeof value.condition === 'string' &&
    'riskLevel' in value && ['High', 'Medium', 'Low'].includes(String(value.riskLevel)) &&
    'priorityScore' in value && typeof value.priorityScore === 'number' &&
    'justification' in value && typeof value.justification === 'string' &&
    'recommendation' in value && typeof value.recommendation === 'string'
  );
}

export default function App() {
  const prefersReducedMotion = useReducedMotion();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isScreenUnfocused, setIsScreenUnfocused] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [userRole, setUserRole] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLocalRoadForm, setShowLocalRoadForm] = useState(false);
  const [editingLocalRoad, setEditingLocalRoad] = useState<LocalRoad | null>(null);

  const [localRoadData, setLocalRoadData] = useState<LocalRoad[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<Maintenance[]>([]);
  const [scheduledInspectionIds, setScheduledInspectionIds] = useState<string[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(true);

  const [idleCountdown, setIdleCountdown] = useState(0);
  // @mine — set when an authenticated call answers 401 (see lib/session-expiry).
  const [sessionExpired, setSessionExpired] = useState(false);
  const lastActivity = useRef(Date.now());
  const handleLogoutRef = useRef<() => void>(() => {});

  useEffect(() => {
    try {
      const savedRecommendations = window.localStorage.getItem(AI_RECOMMENDATIONS_STORAGE_KEY);
      if (!savedRecommendations) return;
      const parsedRecommendations: unknown = JSON.parse(savedRecommendations);
      if (!Array.isArray(parsedRecommendations) || !parsedRecommendations.every(isPredictionResult)) {
        throw new Error('Saved AI recommendations have an invalid format.');
      }
      setAiRecommendations(parsedRecommendations);
    } catch (error) {
      console.error('Failed to restore saved AI recommendations.', error);
    }
  }, []);

  // @mine — prefer the latest AI run saved in Supabase (shared across users);
  // the localStorage copy above remains as an offline fallback.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    fetch('/api/ai-priority')
      .then(async (response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !Array.isArray(payload?.data) || payload.data.length === 0) return;
        if (payload.data.every(isPredictionResult)) setAiRecommendations(payload.data);
      })
      .catch((error: unknown) => console.error('Failed to load saved AI recommendations.', error));
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  useEffect(() => {
    const interval = window.setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateScreenFocus = () => {
      setIsScreenUnfocused(document.visibilityState === 'hidden' || !document.hasFocus());
    };

    window.addEventListener('blur', updateScreenFocus);
    window.addEventListener('focus', updateScreenFocus);
    document.addEventListener('visibilitychange', updateScreenFocus);
    updateScreenFocus();

    return () => {
      window.removeEventListener('blur', updateScreenFocus);
      window.removeEventListener('focus', updateScreenFocus);
      document.removeEventListener('visibilitychange', updateScreenFocus);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    let active = true;
    let generation = 0;
    const refreshRecords = async () => {
      const current = ++generation;
      const load = async (url: string, apply: (data: any[]) => void) => {
        try {
          const records = await loadRecords(url);
          if (active && current === generation) apply(records);
        } catch (error) {
          // Never erase a successful project save because another module failed to refresh.
          console.error(`Failed to load ${url}; keeping existing records.`, error);
        }
      };
      await Promise.all([
        load('/api/local-road', setLocalRoadData),
        load('/api/inspections', setInspections),
        (async () => {
          try {
            const response = await fetch('/api/maintenance');
            if (!response.ok) throw new Error(`Request failed (${response.status}).`);
            const payload = await response.json();
            if (!Array.isArray(payload.data) || !Array.isArray(payload.scheduledInspectionIds)) throw new Error('Invalid maintenance response.');
            if (active && current === generation) { setMaintenanceRecords(payload.data); setScheduledInspectionIds(payload.scheduledInspectionIds); }
          } catch (error) { console.error('Failed to load maintenance records.', error); }
        })(),
      ]);
      if (active && current === generation) setLoading(false);
    };
    setLoading(true);
    void refreshRecords();
    const onChange = () => { void refreshRecords(); };
    window.addEventListener('local-road-records-changed', onChange);
    const refreshInterval = window.setInterval(onChange, 60 * 1000);
    window.addEventListener('focus', onChange);
    return () => {
      active = false;
      window.removeEventListener('local-road-records-changed', onChange);
      window.removeEventListener('focus', onChange);
      window.clearInterval(refreshInterval);
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) return;

    lastActivity.current = Date.now();
    setIdleCountdown(0);

    const resetTimer = () => {
      lastActivity.current = Date.now();
      setIdleCountdown(0);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, resetTimer));

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivity.current;
      if (elapsed >= IDLE_TIMEOUT_MS) {
        handleLogoutRef.current();
      } else if (elapsed >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) {
        setIdleCountdown(Math.ceil((IDLE_TIMEOUT_MS - elapsed) / 1000));
      }
    }, 1000);

    return () => {
      events.forEach((event) => window.removeEventListener(event, resetTimer));
      window.clearInterval(interval);
    };
  }, [isLoggedIn]);

  // @mine — restore an existing Supabase session (httpOnly cookies) on load/refresh.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me')
      .then(async (response) => {
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled || !payload?.role) return;
        setUserRole(payload.role);
        setUserName(payload.name || payload.username || '');
        setUserEmail(payload.email || '');
        setActiveTab(payload.role === 'Staff - Inspector' ? 'inspection-management' : 'dashboard');
        setIsLoggedIn(true);
        window.dispatchEvent(new Event('local-road-records-changed'));
      })
      .catch(() => { /* no session — stay on the login page */ });
    return () => { cancelled = true; };
  }, []);

  const handleLogin = (role: string, username: string, email: string) => {
    setUserRole(role);
    setUserName(username);
    setUserEmail(email);
    setActiveTab(role === 'Staff - Inspector' ? 'inspection-management' : 'dashboard');
    setIsLoggedIn(true);
    // @mine — data now requires a session, so (re)load it after signing in.
    window.dispatchEvent(new Event('local-road-records-changed'));
  };

  const handleLogout = () => {
    // @mine — end the Supabase session server-side (clears httpOnly cookies).
    void fetch('/api/auth/logout', { method: 'POST' }).catch(() => { /* still log out locally */ });
    void fetch('/api/activity-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: userName || 'unknown', action: 'Logout', details: `User ${userName || 'unknown'} logged out` }),
    }).catch((error: unknown) => {
      console.error('Failed to record logout activity.', error);
    });
    setIsLoggedIn(false);
    setUserRole('');
    setUserName('');
    setUserEmail('');
    setActiveTab('dashboard');
  };

  handleLogoutRef.current = handleLogout;

  // @mine — a 401 from an authenticated call means the session is gone; say so
  // instead of showing "You must be signed in to do that." over a stale page.
  const loggedInRef = useRef(false);
  loggedInRef.current = isLoggedIn;

  useEffect(() => {
    installSessionExpiryHandler();
    const onExpired = () => {
      if (loggedInRef.current) setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const handleTabChange = (tab: string) => {
    setShowLocalRoadForm(false);
    setEditingLocalRoad(null);
    setActiveTab(tab);
    if (tab === 'validation-management' || tab === 'project-management') window.dispatchEvent(new Event('local-road-records-changed'));
  };

  const handleAiRecommendationsChange = (recommendations: PredictionResult[]) => {
    setAiRecommendations(recommendations);
    try {
      window.localStorage.setItem(AI_RECOMMENDATIONS_STORAGE_KEY, JSON.stringify(recommendations));
    } catch (error) {
      console.error('Failed to persist AI recommendations in this browser.', error);
    }
  };

  const handleAddLocalRoad = () => {
    setEditingLocalRoad(null);
    setShowLocalRoadForm(true);
  };

  const handleEditLocalRoad = (item: LocalRoad) => {
    setEditingLocalRoad(item);
    setShowLocalRoadForm(true);
  };

  const handleSaveLocalRoad = async (data: Omit<LocalRoad, 'id'> & { id?: string }) => {
    const recordId = data.id || editingLocalRoad?.id;
    const normalizedData: LocalRoad = {
      id: recordId ?? crypto.randomUUID(),
      name: data.name || data.projectName || '',
      type: data.type || data.projectCategory || '',
      location: data.location || '',
      dateBuilt: data.dateBuilt || '',
      dateStarted: data.dateStarted || data.dateBuilt || '',
      condition: data.condition || 'Good',
      lastInspection: data.lastInspection,
      projectName: data.projectName || data.name || '',
      projectCategory: data.projectCategory || data.type || '',
      projectDescription: data.projectDescription || '',
      targetCompletionDate: data.targetCompletionDate || '',
      noOfExtensions: data.noOfExtensions || '',
      actualCompletionDate: data.actualCompletionDate || '',
      roadNetworkId: data.roadNetworkId || '',
      roadName: data.roadName || data.name || '',
      barangay: data.barangay || '',
      components: data.components || '',
      description: data.description || '',
      contractorName: data.contractorName || '',
      contractorAddress: data.contractorAddress || '',
      contactInformation: data.contactInformation || '',
      sourceOfFunds: data.sourceOfFunds || '',
      appropriation: data.appropriation || '',
      contractedAmount: data.contractedAmount || '',
      completionDate: data.completionDate || '',
      turnoverDate: data.turnoverDate || '',
      attachments: data.attachments || [],
    };

    try {
      const response = await fetch('/api/local-road', {
        method: recordId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedData),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.message || `Unable to save this road (HTTP ${response.status}).`);
      const savedRoad = payload.data as LocalRoad;
      setLocalRoadData((previous) => recordId
        ? previous.map((item) => (item.id === recordId ? savedRoad : item))
        : [...previous, savedRoad]);
      if (recordId) {
        handleAiRecommendationsChange(aiRecommendations.map((prediction) =>
          prediction.localRoadId === recordId
            ? {
                ...prediction,
                localRoadName: savedRoad.projectName || savedRoad.name,
                type: savedRoad.type,
              }
            : prediction
        ));
      }
      if (typeof payload.data?.attachmentWarning === 'string') window.alert(payload.data.attachmentWarning);
      window.dispatchEvent(new Event('local-road-records-changed'));
    } catch (error) {
      console.error('Failed to save local road record.', error);
      throw error;
    }
  };

  const handleDeleteLocalRoad = (id: string) => {
    fetch(`/api/local-road?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || 'Unable to delete this road.');
        setLocalRoadData((prev) => prev.filter((item) => item.id !== id));
        setInspections((prev) => prev.filter((item) => item.localRoadId !== id));
        setMaintenanceRecords((prev) => prev.filter((item) => item.localRoadId !== id));
      })
      .catch((error: unknown) => {
        console.error('Failed to delete local road record.', error);
        window.alert(error instanceof Error ? error.message : 'Unable to delete this road.');
      });
  };

  const handleSaveValidation = async (
    id: string,
    result: 'Validated' | 'Return for Revision',
    remarks: string,
    annualYear?: number
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/local-road', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          validationResult: result,
          validationRemarks: remarks,
          ...(annualYear !== undefined ? { annualValidationYear: annualYear } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to save validation.');
      setLocalRoadData((prev) => prev.map((item) => item.id === id ? payload.data : item));
      if (payload.inspection) {
        const inspection = payload.inspection as Inspection;
        setInspections((prev) => prev.some((item) => item.id === inspection.id)
          ? prev.map((item) => item.id === inspection.id ? inspection : item)
          : [...prev, inspection]);
      }
      return true;
    } catch (error) {
      console.error('Failed to save road validation.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to save validation.');
      return false;
    }
  };

  const handleAddInspection = async (inspection: Omit<Inspection, 'id'>) => {
    try {
      const response = await fetch('/api/inspections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inspection),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to save inspection.');
      const newInspection = payload.data as Inspection;
      setInspections((prev) => [...prev, newInspection]);

      const condition =
        inspection.conditionRating <= 0 ? 'Not rated' :
        inspection.conditionRating >= 8 ? 'Good' :
        inspection.conditionRating >= 5 ? 'Fair' : 'Poor';

      setLocalRoadData((prev) =>
        prev.map((item) =>
          item.id === inspection.localRoadId
            ? { ...item, condition, lastInspection: inspection.date }
            : item
        )
      );
    } catch (error) {
      console.error('Failed to save local road inspection.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to save inspection.');
    }
  };

  const handleEditInspection = async (inspection: Inspection): Promise<boolean> => {
    try {
      const response = await fetch('/api/inspections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inspection),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to update inspection.');

      setInspections((prev) => prev.map((item) => item.id === inspection.id ? payload.data : item));
      setLocalRoadData((prev) => prev.map((road) => {
        const update = payload.roadUpdates?.find((item: { id: string }) => item.id === road.id);
        return update ? { ...road, condition: update.condition, lastInspection: update.lastInspection } : road;
      }));
      return true;
    } catch (error) {
      console.error('Failed to update inspection.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to update inspection.');
      return false;
    }
  };

  const handleDeleteInspection = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/inspections?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to delete inspection.');

      setInspections((prev) => prev.filter((item) => item.id !== id));
      setLocalRoadData((prev) => prev.map((road) => {
        const update = payload.roadUpdates?.find((item: { id: string }) => item.id === road.id);
        return update ? { ...road, condition: update.condition, lastInspection: update.lastInspection } : road;
      }));
      return true;
    } catch (error) {
      console.error('Failed to delete inspection.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to delete inspection.');
      return false;
    }
  };

  const handleAddMaintenance = async (maintenance: Omit<Maintenance, 'id'>) => {
    try {
      const response = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenance),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to save maintenance record.');
      setMaintenanceRecords((prev) => [...prev, payload.data]);
      if (payload.data.inspectionId) setScheduledInspectionIds(prev => [...new Set([...prev, payload.data.inspectionId])]);
      return true;
    } catch (error) {
      console.error('Failed to save local road maintenance.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to save maintenance record.');
      return false;
    }
  };

  const handleEditMaintenance = async (maintenance: Maintenance) => {
    try {
      const response = await fetch('/api/maintenance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(maintenance),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to update maintenance record.');
      setMaintenanceRecords((prev) => prev.map((item) => item.id === maintenance.id ? payload.data : item));
    } catch (error) {
      console.error('Failed to edit local road maintenance.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to update maintenance record.');
    }
  };

  const handleDeleteMaintenance = async (id: string) => {
    try {
      const response = await fetch('/api/maintenance', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to delete maintenance record.');
      setMaintenanceRecords((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Failed to delete local road maintenance.', error);
      window.alert(error instanceof Error ? error.message : 'Unable to delete maintenance record.');
    }
  };

  const handleUpdateMaintenanceStatus = (
    id: string,
    status: 'Scheduled' | 'In Progress' | 'Completed' | 'Deferred',
    completedDate?: string
  ) => {
    fetch('/api/maintenance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, completedDate }),
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || 'Unable to update maintenance status.');
        setMaintenanceRecords((prev) => prev.map((item) => item.id === id ? payload.data : item));
      })
      .catch((error: unknown) => {
        console.error('Failed to update local road maintenance status.', error);
        window.alert(error instanceof Error ? error.message : 'Unable to update maintenance status.');
      });
  };

  // Role-based access control based on system diagram
  const hasAccess = (module: string): boolean => {
    const rolePermissions: Record<string, string[]> = {
      'Head Engineer': ['dashboard', 'analytics', 'project-management', 'inspection-management', 'maintenance-management', 'ai', 'system-management'],
      Admin: ['dashboard', 'analytics', 'project-management', 'inspection-management', 'maintenance-management', 'ai', 'system-management'],
      'Staff - Encoder': ['dashboard', 'project-management', 'maintenance-management'],
      'Staff - Inspector': ['dashboard', 'inspection-management'],
      'Staff - Validator': ['dashboard', 'validation-management'],
    };
    return rolePermissions[userRole]?.includes(module) || false;
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="flex h-screen bg-[#1a1d3f] overflow-hidden">
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        userRole={userRole}
        userName={userName}
        onLogout={handleLogout}
      />
      <div className="module-content min-h-0 min-w-0 flex-1 overflow-auto bg-[#E3EEF9]">
        <div className="grid min-h-full">
          <AnimatePresence mode="sync" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: prefersReducedMotion ? 1 : 0, y: prefersReducedMotion ? 0 : -4 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
              className="col-start-1 row-start-1 min-h-full"
            >
              {activeTab === 'dashboard' && hasAccess('dashboard') && (
                <Dashboard
                  localRoadData={localRoadData}
                  inspections={inspections}
                  onTabChange={setActiveTab}
                />
              )}
              {activeTab === 'project-management' && hasAccess('project-management') && (
                <LocalRoadList
                  data={localRoadData}
                  onAdd={handleAddLocalRoad}
                  onEdit={handleEditLocalRoad}
                  onDelete={handleDeleteLocalRoad}
                  currentUser={userName}
                  userRole={userRole}
                />
              )}
              {activeTab === 'inspection-management' && hasAccess('inspection-management') && (
                <InspectionModule
                  inspections={inspections}
                  localRoadList={localRoadData}
                  onAddInspection={handleAddInspection}
                  onEditInspection={handleEditInspection}
                  onDeleteInspection={handleDeleteInspection}
                  currentUser={userName}
                  userRole={userRole}
                />
              )}
              {activeTab === 'maintenance-management' && hasAccess('maintenance-management') && (
                <MaintenanceModule
                  maintenanceRecords={maintenanceRecords}
                  scheduledInspectionIds={scheduledInspectionIds}
                  localRoadList={localRoadData}
                  inspections={inspections}
                  onAddMaintenance={handleAddMaintenance}
                  onEditMaintenance={handleEditMaintenance}
                  onDeleteMaintenance={handleDeleteMaintenance}
                  onUpdateStatus={handleUpdateMaintenanceStatus}
                  currentUser={userName}
                  userRole={userRole}
                />
              )}
              {activeTab === 'ai' && hasAccess('ai') && (
                <AIPredictionModule
                  localRoadData={localRoadData}
                  inspections={inspections}
                  predictions={aiRecommendations}
                  onPredictionsChange={handleAiRecommendationsChange}
                />
              )}
              {activeTab === 'analytics' && hasAccess('analytics') && (
                <AnalyticsDashboard
                  localRoadData={localRoadData}
                />
              )}
              {activeTab === 'validation-management' && hasAccess('validation-management') && (
                <LocalRoadList
                  data={localRoadData}
                  onAdd={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  validationMode
                  validatorName={userName}
                  currentUser={userName}
                  onSaveValidation={handleSaveValidation}
                  userRole={userRole}
                />
              )}
              {activeTab === 'system-management' && hasAccess('system-management') && (
                <UserManagementModule currentUserEmail={userEmail} />
              )}
              {!hasAccess(activeTab) && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-8 bg-white rounded-lg shadow-md">
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Access Denied</h2>
                    <p className="text-gray-600">You don't have permission to access this module.</p>
                    <p className="text-sm text-gray-500 mt-4">Your role: <span className="font-semibold capitalize">{userRole}</span></p>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="fixed bottom-2 right-3 z-40 flex justify-end px-2 sm:right-5">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <CalendarDays aria-hidden="true" className="h-3.5 w-3.5 text-blue-600" />
            <time dateTime={currentDateTime.toISOString()}>
              {currentDateTime.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </time>
            <Clock3 aria-hidden="true" className="ml-1 h-3.5 w-3.5 text-blue-600" />
            <time dateTime={currentDateTime.toISOString()}>
              {currentDateTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
          </div>
        </div>
      </div>
      {showLocalRoadForm && (
        <LocalRoadForm
          key={editingLocalRoad?.id ?? 'new-local-road'}
          item={editingLocalRoad}
          editId={editingLocalRoad?.id}
          onSave={handleSaveLocalRoad}
          onClose={() => {
            setShowLocalRoadForm(false);
            setEditingLocalRoad(null);
          }}
        />
      )}
      {idleCountdown > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-8 w-full max-w-sm text-center">
            <h2 className="text-xl font-bold text-[#0ea5e9] mb-2">Session Expiring</h2>
            <p className="text-gray-600 mb-4">
              You have been inactive. You will be logged out in{' '}
              <span className="font-bold text-red-500">{idleCountdown}</span> seconds.
            </p>
            <p className="text-sm text-gray-500">Move your mouse or press a key to continue.</p>
          </div>
        </div>
      )}
      {sessionExpired && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
          <div role="alertdialog" aria-labelledby="session-ended-title" className="w-full max-w-sm rounded-lg bg-white p-8 text-center shadow-lg">
            <h2 id="session-ended-title" className="mb-2 text-xl font-bold text-[#0ea5e9]">Session ended</h2>
            <p className="mb-4 text-gray-600">
              Your sign-in is no longer valid. This happens when the session expires or when your own account was
              edited (changing your e-mail or password signs you out). Sign in again to continue.
            </p>
            <button
              type="button"
              onClick={() => { setSessionExpired(false); handleLogoutRef.current(); }}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 font-semibold text-white transition hover:brightness-105"
            >
              Sign in again
            </button>
          </div>
        </div>
      )}
      {isLoggedIn && isScreenUnfocused && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-slate-950/85 p-6 text-center text-white backdrop-blur-2xl" role="status" aria-live="polite">
          <p className="text-sm font-medium tracking-wide">Content hidden while the application is out of focus</p>
        </div>
      )}
    </div>
  );
}
