import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { User, Plus, Edit, Trash2, Shield, X, Save, Users, Activity, Archive, Search, Lock, Unlock, CheckCircle2, Award, UserX, KeyRound, Eye, EyeOff, CalendarDays, RotateCcw, ChevronDown, Check } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
// @mine — step 8: the 30-day archive retention, shown per archived record.
import { purgeScheduleLabel } from '@/lib/retention';

interface UserData {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: 'Active' | 'Inactive' | 'Locked';
  createdDate: string;
}

interface UserRecordFromApi {
  userId: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: 'Active' | 'Inactive';
  createdDate?: string;
}

interface ActivityLog {
  id: string;
  user: string;
  action: string;
  timestamp: string;
  details: string;
}

interface ArchivedRecord {
  id: string;
  // @mine — step 8: when the record was archived, so the row can show its deletion date.
  archivedAt?: string;
  projectName?: string;
  name?: string;
  roadName?: string;
  localRoadName?: string;
  type?: string;
  location?: string;
  projectCategory?: string;
  date?: string;
  inspectionType?: string;
  inspector?: string;
  validationStatus?: string;
  conditionRating?: number;
  remarks?: string;
  scheduledDate?: string;
  completedDate?: string;
  status?: string;
  cost?: number;
  description?: string;
}

// @mine — these are the labels the API/session already use (ROLE_FROM_DB); the old
// short list ('Admin', 'Encoder', …) matched no stored role, so the select showed
// blank and the server coerced every choice into an Encoder.
const AVAILABLE_ROLES = ['Head Engineer', 'Staff - Encoder', 'Staff - Inspector', 'Staff - Validator'] as const;

const getRoleDisplayName = (role: string) => {
  const displayNames: Record<string, string> = {
    Admin: 'Head Engineer',
    Encoder: 'Staff - Encoder',
    Inspector: 'Staff - Inspector',
    Validator: 'Staff - Validator',
  };

  return displayNames[role] ?? role;
};

const getNextEmployeeId = (userList: UserData[]) => {
  const ids = userList
    .map(user => Number.parseInt(user.employeeId.replace(/\D+/g, ''), 10))
    .filter(value => Number.isFinite(value));

  const nextNumber = ids.length ? Math.max(...ids) + 1 : 1;
  return `EMP-${String(nextNumber).padStart(4, '0')}`;
};

const mapUserRecords = (records: UserRecordFromApi[]): UserData[] => records.map((user, index) => ({
  id: user.userId,
  employeeId: `EMP-${String(index + 1).padStart(4, '0')}`,
  name: user.name,
  email: user.email,
  username: user.username,
  role: user.role,
  status: user.status,
  createdDate: user.createdDate || new Date().toISOString().split('T')[0],
}));

export function UserManagementModule({ currentUserEmail }: { currentUserEmail: string }) {
  const [activeTab, setActiveTab] = useState<'accounts' | 'activity' | 'archived'>('accounts');
  const [archiveFilter, setArchiveFilter] = useState<'users' | 'projects' | 'inspections' | 'maintenance'>('users');
  const [activityDateFilter, setActivityDateFilter] = useState('');
  const activityDateRef = useRef<HTMLInputElement>(null);
  const [userRoleFilter, setUserRoleFilter] = useState('All Roles');
  const [userStatusFilter, setUserStatusFilter] = useState('All Status');
  const [activityUserFilter, setActivityUserFilter] = useState('All Users');
  const [activeUserFormTab, setActiveUserFormTab] = useState<'account' | 'access'>('account');
  const userFormScrollRef = useRef<HTMLDivElement>(null);
  const userAccountSectionRef = useRef<HTMLElement>(null);
  const userAccessSectionRef = useRef<HTMLElement>(null);
  const [users, setUsers] = useState<UserData[]>([]);

  const [archivedUsers, setArchivedUsers] = useState<UserData[]>([]);
  const [archivedRecords, setArchivedRecords] = useState<ArchivedRecord[]>([]);
  const [archivedInspections, setArchivedInspections] = useState<ArchivedRecord[]>([]);
  const [archivedMaintenance, setArchivedMaintenance] = useState<ArchivedRecord[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState('');

  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  // @mine — null = unknown; false = no master code yet (first-run setup allowed).
  const [masterCodeConfigured, setMasterCodeConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    if (!showPasswordForm) return;
    let cancelled = false;
    fetch('/api/auth/unlock')
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!cancelled && payload) setMasterCodeConfigured(Boolean(payload.hasMasterCode));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [showPasswordForm]);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const generatedEmployeeId = getNextEmployeeId(users);
  const moveToUserFormTab = (tab: 'account' | 'access') => {
    const sectionRef = tab === 'account' ? userAccountSectionRef : userAccessSectionRef;
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveUserFormTab(tab);
  };
  const updateActiveUserFormTab = () => {
    const scrollTop = userFormScrollRef.current?.getBoundingClientRect().top ?? 0;
    const accessTop = userAccessSectionRef.current?.getBoundingClientRect().top ?? Infinity;
    setActiveUserFormTab(accessTop <= scrollTop + 110 ? 'access' : 'account');
  };
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    username: '',
    password: '',
    role: 'Staff - Encoder',
    status: 'Active' as UserData['status'],
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showUserPassword, setShowUserPassword] = useState(false);
  const [lockedUsers, setLockedUsers] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<{
    isOpen: boolean;
    type: 'confirmation' | 'message' | 'error';
    title: string;
    message: string;
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    type: 'message',
    title: '',
    message: '',
  });

  useEffect(() => {
    fetch('/api/auth/status')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.message || 'Unable to load local user accounts.');
        if (!Array.isArray(payload.users)) throw new Error('Local user account data is invalid.');
        setUsers(mapUserRecords(payload.users));
        if (!Array.isArray(payload.archivedUsers)) throw new Error('Archived user data is invalid.');
        setArchivedUsers(mapUserRecords(payload.archivedUsers));
      })
      .catch((error: unknown) => {
        console.error('Failed to load local user accounts.', error);
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Accounts Unavailable',
          message: error instanceof Error ? error.message : 'Unable to load local user accounts.',
        });
      });
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/activity-logs')
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.logs)) throw new Error(payload?.message || 'Unable to load activity logs.');
        if (!cancelled) setActivityLogs(previous => [...previous.filter(entry => !payload.logs.some((log: ActivityLog) => log.id === entry.id)), ...payload.logs]);
      })
      .catch((error: unknown) => { if (!cancelled) setActivityError(error instanceof Error ? error.message : 'Unable to load activity logs.'); })
      .finally(() => { if (!cancelled) setActivityLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    Promise.all([fetch('/api/local-road'), fetch('/api/inspections'), fetch('/api/maintenance')])
      .then(async ([roadsResponse, inspectionsResponse, maintenanceResponse]) => {
        const roadsPayload = await roadsResponse.json();
        const inspectionsPayload = await inspectionsResponse.json();
        const maintenancePayload = await maintenanceResponse.json();
        if (roadsResponse.ok && Array.isArray(roadsPayload.archived)) setArchivedRecords(roadsPayload.archived);
        if (inspectionsResponse.ok && Array.isArray(inspectionsPayload.archived)) setArchivedInspections(inspectionsPayload.archived);
        if (maintenanceResponse.ok && Array.isArray(maintenancePayload.archived)) setArchivedMaintenance(maintenancePayload.archived);
      })
      .catch((error) => console.error('Failed to load archived records.', error));
  }, []);

  useEffect(() => {
    const handleActivityLogCreated = (event: Event) => {
      const log = (event as CustomEvent<ActivityLog>).detail;
      if (log?.id) setActivityLogs((previous) => [log, ...previous.filter((entry) => entry.id !== log.id)]);
    };

    window.addEventListener('activity-log-created', handleActivityLogCreated);
    return () => window.removeEventListener('activity-log-created', handleActivityLogCreated);
  }, []);

  const refreshArchivedRecords = async () => {
    const responses = await Promise.all([fetch('/api/local-road'), fetch('/api/inspections'), fetch('/api/maintenance')]);
    const payloads = await Promise.all(responses.map((response) => response.json()));
    if (responses[0].ok && Array.isArray(payloads[0].archived)) setArchivedRecords(payloads[0].archived);
    if (responses[1].ok && Array.isArray(payloads[1].archived)) setArchivedInspections(payloads[1].archived);
    if (responses[2].ok && Array.isArray(payloads[2].archived)) setArchivedMaintenance(payloads[2].archived);
  };

  const refreshUserAccounts = async () => {
    const response = await fetch('/api/auth/status');
    const payload = await response.json();
    if (!response.ok || !Array.isArray(payload.users) || !Array.isArray(payload.archivedUsers)) {
      throw new Error(payload?.message || 'Unable to refresh user accounts.');
    }
    setUsers(mapUserRecords(payload.users));
    setArchivedUsers(mapUserRecords(payload.archivedUsers));
  };

  const handleRestoreRecord = async (id: string) => {
    const response = await fetch('/api/local-road', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'restore' }),
    });
    if (!response.ok) {
      setDialog({ isOpen: true, type: 'error', title: 'Restore Failed', message: 'Unable to restore the archived record.' });
      return;
    }
    await refreshArchivedRecords();
    window.dispatchEvent(new Event('local-road-records-changed'));
  };

  // Ask before any permanent deletion; the request is sent only after confirmation.
  const confirmDeleteArchivedRecord = (kind: 'project' | 'inspection' | 'maintenance', record: ArchivedRecord) => {
    const name = record.projectName || record.localRoadName || record.roadName || record.name || 'Unnamed project';
    const date = kind === 'inspection' ? record.date : kind === 'maintenance' ? record.scheduledDate : undefined;
    setDialog({
      isOpen: true,
      type: 'confirmation',
      title: `Delete Archived ${kind === 'project' ? 'Project' : kind === 'inspection' ? 'Inspection' : 'Maintenance'}`,
      message: `Permanently delete the archived ${kind} record for ${name}${date ? ` (${date})` : ''}? This action cannot be undone and may also remove related data.`,
      onConfirm: async () => {
        try {
          const response = kind === 'project'
            ? await fetch(`/api/local-road?id=${encodeURIComponent(record.id)}&permanent=true`, { method: 'DELETE' })
            : kind === 'inspection'
              ? await fetch(`/api/inspections?id=${encodeURIComponent(record.id)}&permanent=true`, { method: 'DELETE' })
              : await fetch('/api/maintenance?permanent=true', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id }) });
          if (!response.ok) throw new Error(`Unable to permanently delete the archived ${kind} record.`);
          await refreshArchivedRecords();
          window.dispatchEvent(new Event('local-road-records-changed'));
        } catch (error) {
          setDialog({ isOpen: true, type: 'error', title: 'Delete Failed', message: error instanceof Error ? error.message : 'Unable to delete the archived record.' });
        }
      },
    });
  };

  const refreshLockStatus = async () => {
    try {
      const res = await fetch('/api/auth/lock-status');
      const payload = await res.json();
      setLockedUsers(payload?.locked ?? {});
    } catch {
      setLockedUsers({});
    }
  };

  useEffect(() => {
    refreshLockStatus();

    const interval = window.setInterval(() => {
      refreshLockStatus();
    }, 1000);

    const handleFocus = () => refreshLockStatus();
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [activeTab]);

  const roleColors: Record<string, string> = {
    'Head Engineer': 'bg-[#0ea5e9]/10 text-[#0ea5e9]',
    'Staff - Encoder': 'bg-[#0ea5e9]/10 text-[#0ea5e9]',
    'Staff - Inspector': 'bg-[#38bdf8]/10 text-[#38bdf8]',
    'Staff - Validator': 'bg-[#7dd3fc]/10 text-[#7dd3fc]',
    Admin: 'bg-[#0ea5e9]/10 text-[#0ea5e9]',
    Encoder: 'bg-[#0ea5e9]/10 text-[#0ea5e9]',
    Inspector: 'bg-[#38bdf8]/10 text-[#38bdf8]',
    Validator: 'bg-[#7dd3fc]/10 text-[#7dd3fc]',
  };

  const activityAccounts = [...users, ...archivedUsers];
  const archivedItemCount =
    archivedUsers.length +
    archivedRecords.length +
    archivedInspections.length +
    archivedMaintenance.length;
  const getAccountRole = (role: string) => role.replace(/^Staff\s*-\s*/i, '').toLowerCase();
  const activityRoleGroups = [
    { role: 'Admin', accounts: activityAccounts.filter((user) => ['admin', 'head engineer'].includes(user.role.toLowerCase())) },
    { role: 'Encoder', accounts: activityAccounts.filter((user) => getAccountRole(user.role) === 'encoder') },
    { role: 'Inspector', accounts: activityAccounts.filter((user) => getAccountRole(user.role) === 'inspector') },
    { role: 'Validator', accounts: activityAccounts.filter((user) => getAccountRole(user.role) === 'validator') },
  ];
  const selectedActivityAccount = activityAccounts.find((user) => user.id === activityUserFilter);
  const filteredActivityLogs = activityLogs.filter((log) => {
    if (activityUserFilter !== 'All Users') {
      if (!selectedActivityAccount) return false;
      const logUser = log.user.toLowerCase();
      if (![selectedActivityAccount.username, selectedActivityAccount.name, selectedActivityAccount.email]
        .some((identity) => identity.toLowerCase() === logUser)) return false;
    }
    if (!activityDateFilter) return true;

    const displayedIsoDate = /^\d{4}-\d{2}-\d{2}/.exec(log.timestamp)?.[0];
    if (displayedIsoDate) return displayedIsoDate === activityDateFilter;
    const timestamp = new Date(log.timestamp);
    if (Number.isNaN(timestamp.getTime())) return false;
    const localDate = [
      timestamp.getFullYear(),
      String(timestamp.getMonth() + 1).padStart(2, '0'),
      String(timestamp.getDate()).padStart(2, '0'),
    ].join('-');
    return localDate === activityDateFilter;
  });

  const handleAddUser = () => {
    if (savingUser) return;
    const username = formData.username || formData.email.split('@')[0] || generatedEmployeeId.toLowerCase();
    if (!formData.name || !formData.email || !formData.password) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill in all fields',
      });
      return;
    }

    setSavingUser(true);
    fetch('/api/auth/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, username }),
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to create the user account.');
      const user = payload.user;
      setUsers(previous => [...previous, {
        id: user.userId,
        employeeId: generatedEmployeeId,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
        createdDate: new Date().toISOString().split('T')[0],
      }]);
      void recordActivity('User Created', `Created user ${user.name}`);
      handleClose();
    }).catch(error => {
      setDialog({ isOpen: true, type: 'error', title: 'Create Account Failed', message: error instanceof Error ? error.message : 'Unable to create the user account.' });
    }).finally(() => setSavingUser(false));
  };

  const handleEditUser = (user: UserData) => {
    setActiveUserFormTab('account');
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      username: user.username,
      password: '',
      role: user.role,
      status: user.status,
    });
    setShowAddForm(true);
  };

  const handleSaveEdit = async () => {
    if (!editingUser || savingUser) return;
    setSavingUser(true);

    try {
      const response = await fetch('/api/auth/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingUser.id, ...formData }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to update the user account.');
      await refreshUserAccounts();
      // @mine — record whether the sign-in email changed (never the password).
      const changes: string[] = [];
      if (editingUser.email.toLowerCase() !== formData.email.trim().toLowerCase()) {
        changes.push(`email ${editingUser.email} → ${formData.email.trim()}`);
      }
      if (editingUser.role !== formData.role) {
        changes.push(`role ${editingUser.role} → ${formData.role}`);
      }
      const detail = changes.length
        ? `Updated user ${formData.name} (${changes.join(', ')})`
        : `Updated user ${formData.name}`;
      void recordActivity('User Updated', detail);
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: error instanceof Error ? error.message : 'Unable to update the user account.',
      });
      return;
    } finally { setSavingUser(false); }

    setEditingUser(null);
    setFormData({ name: '', email: '', username: '', password: '', role: 'Staff - Encoder', status: 'Active' });
    setShowAddForm(false);
  };

  const handleArchiveUser = (id: string) => {
    const userToArchive = users.find(user => user.id === id);
    if (!userToArchive) return;
    if (userToArchive.email.toLowerCase() === currentUserEmail.toLowerCase()) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Cannot Archive Account',
        message: 'You cannot archive your own account while signed in.',
      });
      return;
    }

    setDialog({
      isOpen: true,
      type: 'confirmation',
      title: 'Archive User',
      message: `Are you sure you want to archive ${userToArchive.name}?`,
      onConfirm: async () => {
        try {
          const response = await fetch('/api/auth/status', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: id, action: 'archive' }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.message || 'Unable to archive the user.');
          await refreshUserAccounts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Archive Failed',
            message: error instanceof Error ? error.message : 'Unable to archive the user.',
          });
          return;
        }
        setActivityLogs(prev => [...prev, {
          id: Date.now().toString(),
          user: 'admin',
          action: 'User Archived',
          timestamp: new Date().toLocaleString(),
          details: `Archived user ${userToArchive.name}`,
        }]);
        void recordActivity('User Archived', `Archived user ${userToArchive.name}`);
      },
    });
  };

  const handleToggleStatus = async (id: string) => {
    const user = users.find(u => u.id === id);
    if (!user) return;

    const activeAdmins = users.filter(u => u.status === 'Active' && u.role === 'Head Engineer');
    if (user.status === 'Active' && user.role === 'Head Engineer' && activeAdmins.length <= 1) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Cannot Deactivate',
        message: 'Cannot deactivate the last active Head Engineer.',
      });
      return;
    }

    const newStatus = user.status === 'Active' ? 'Inactive' : 'Active';
    const prevUsers = users;

    setUsers(users.map(u =>
      u.id === id ? { ...u, status: newStatus } : u
    ));

    try {
      const res = await fetch('/api/auth/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, status: newStatus }),
      });

      if (!res.ok) {
        setUsers(prevUsers);
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update status. Please try again.',
        });
        return;
      }
    } catch {
      setUsers(prevUsers);
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update status. Please try again.',
      });
      return;
    }

    setActivityLogs([...activityLogs, {
      id: Date.now().toString(),
      user: 'admin',
      action: newStatus === 'Active' ? 'User Activated' : 'User Deactivated',
      timestamp: new Date().toLocaleString(),
      details: `${newStatus === 'Active' ? 'Activated' : 'Deactivated'} user ${user.name}`,
    }]);
    void recordActivity(newStatus === 'Active' ? 'User Activated' : 'User Deactivated', `${newStatus === 'Active' ? 'Activated' : 'Deactivated'} user ${user.name}`);
  };

  const handleUnlock = async (user: UserData) => {
    setDialog({
      isOpen: true,
      type: 'confirmation',
      title: 'Confirm Unlock',
      message: `Are you sure you want to unlock ${user.name}?`,
      onConfirm: async () => {
        try {
          const res = await fetch('/api/auth/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username }),
          });

          const payload = await res.json();

          if (!res.ok) {
            setDialog({
              isOpen: true,
              type: 'error',
              title: 'Unlock Failed',
              message: payload?.message || 'Failed to unlock account.',
            });
            return;
          }

          const next = { ...lockedUsers };
          delete next[user.username.toLowerCase()];
          setLockedUsers(next);
          await refreshLockStatus();

          setDialog({
            isOpen: true,
            type: 'message',
            title: 'Success',
            message: payload?.message || 'Account unlocked.',
          });

          setActivityLogs([...activityLogs, {
            id: Date.now().toString(),
            user: 'admin',
            action: 'Account Unlocked',
            timestamp: new Date().toLocaleString(),
            details: `Unlocked account for ${user.name}`,
          }]);
        } catch {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Unlock Failed',
            message: 'Failed to unlock account. Please try again.',
          });
        }
      },
      onCancel: () => {
        setDialog({ isOpen: false, type: 'message', title: '', message: '' });
      },
    });
  };

  const handleRestoreUser = async (id: string) => {
    const userToRestore = archivedUsers.find(user => user.id === id);
    if (!userToRestore) return;

    try {
      const response = await fetch('/api/auth/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, action: 'restore' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.message || 'Unable to restore the archived user.');
      await refreshUserAccounts();
      setActivityLogs(prev => [...prev, {
        id: Date.now().toString(),
        user: 'admin',
        action: 'User Restored',
        timestamp: new Date().toLocaleString(),
        details: `Restored user ${userToRestore.name}`,
      }]);
      void recordActivity('User Restored', `Restored user ${userToRestore.name}`);
    } catch (error) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Restore Failed',
        message: error instanceof Error ? error.message : 'Unable to restore the archived user.',
      });
    }
  };

  const handleDeleteArchivedUser = (id: string) => {
    const archivedUser = archivedUsers.find(user => user.id === id);
    if (!archivedUser) return;

    setDialog({
      isOpen: true,
      type: 'confirmation',
      title: 'Delete Archived User',
      message: `Are you sure you want to permanently delete ${archivedUser.name}? This action cannot be undone.`,
      onConfirm: async () => {
        try {
          const response = await fetch(`/api/auth/status?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload?.message || 'Unable to permanently delete the archived user.');
          await refreshUserAccounts();
        } catch (error) {
          setDialog({
            isOpen: true,
            type: 'error',
            title: 'Delete Failed',
            message: error instanceof Error ? error.message : 'Unable to permanently delete the archived user.',
          });
          return;
        }
        setActivityLogs(prev => [...prev, {
          id: Date.now().toString(),
          user: 'admin',
          action: 'User Deleted Permanently',
          timestamp: new Date().toLocaleString(),
          details: `Permanently deleted archived user ${archivedUser.name}`,
        }]);
        void recordActivity('User Deleted Permanently', `Permanently deleted archived user ${archivedUser.name}`);
        setDialog({ isOpen: false, type: 'message', title: '', message: '' });
      },
      onCancel: () => {
        setDialog({ isOpen: false, type: 'message', title: '', message: '' });
      },
    });
  };

  const handlePasswordUpdate = async () => {
    // @mine — the "current" code only exists from the second change onward.
    const needsCurrent = masterCodeConfigured !== false;
    if ((needsCurrent && !passwordForm.currentPassword) || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: needsCurrent
          ? 'Please fill in all password fields.'
          : 'Enter the new master code and confirm it.',
      });
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'The master code must be at least 8 characters long.',
      });
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Validation Error',
        message: 'New password and confirmation do not match.',
      });
      return;
    }

    if (savingPassword) return;
    setSavingPassword(true);
    try {
      const response = await fetch('/api/auth/unlock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setDialog({
          isOpen: true,
          type: 'error',
          title: 'Update Failed',
          message: payload?.message || 'Failed to update master password.',
        });
        return;
      }

      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordForm(false);
      setDialog({
        isOpen: true,
        type: 'message',
        title: 'Success',
        message: payload?.message || 'Master password updated successfully.',
      });
    } catch {
      setDialog({
        isOpen: true,
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update master password. Please try again.',
      });
    } finally { setSavingPassword(false); }
  };

  const handleClose = () => {
    setShowAddForm(false);
    setShowPasswordForm(false);
    setActiveUserFormTab('account');
    setEditingUser(null);
    setFormData({ name: '', email: '', username: '', password: '', role: 'Staff - Encoder', status: 'Active' });
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const filteredUsers = users.filter((user) => {
    const term = search.trim().toLowerCase();
    const normalizedRole = user.role === 'Admin' ? 'Head Engineer' : user.role.startsWith('Staff - ') ? user.role : `Staff - ${user.role}`;
    if (userRoleFilter !== 'All Roles' && normalizedRole !== userRoleFilter) return false;
    if (userStatusFilter !== 'All Status' && user.status !== userStatusFilter) return false;
    if (!term) return true;

    const searchable = [
      user.employeeId,
      user.name,
      user.email,
      user.username,
      user.role,
      user.status,
    ]
      .join(' ')
      .toLowerCase();

    return searchable.includes(term);
  });

  const recordActivity = async (action: string, details: string) => {
    try {
      const response = await fetch('/api/activity-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'admin', action, details }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload.log) setActivityLogs((previous) => [payload.log, ...previous]);
    } catch (error) {
      console.error('Failed to record activity log.', error);
    }
  };

  return (
    <div className="min-h-full space-y-6 bg-[#F4F7FB] p-6 text-slate-800">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-blue-700">System Management</h1>
          <p className="mt-1 text-base text-slate-500">Personnel accounts, security access privileges, and system activity logs.</p>
        </div>
        {activeTab === 'accounts' && (
          <div className="flex items-center gap-3">
            <button onClick={() => { setEditingUser(null); setShowUserPassword(false); setFormData({ name: '', email: '', username: '', password: '', role: 'Staff - Encoder', status: 'Active' }); setActiveUserFormTab('account'); setShowAddForm(true); }} className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 font-semibold text-white shadow-[0_8px_16px_rgba(37,99,235,0.2)] transition hover:brightness-105">
              <Plus className="w-5 h-5" />
              Create User Account
            </button>
            <button onClick={() => setShowPasswordForm(true)} className="flex items-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 font-semibold text-white transition hover:bg-slate-800">
              <Shield className="w-5 h-5" />
              Change Master Password
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 rounded-t-2xl px-6 py-4 font-semibold transition-colors ${
              activeTab === 'accounts'
                ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-5 h-5" />
            Accounts
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs text-blue-700">{users.length}</span>
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 rounded-t-2xl px-6 py-4 font-semibold transition-colors ${
              activeTab === 'activity'
                ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Activity className="w-5 h-5" />
            Activity Logs
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`flex items-center gap-2 rounded-t-2xl px-6 py-4 font-semibold transition-colors ${
              activeTab === 'archived'
                ? 'border-b-2 border-blue-600 bg-white text-blue-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Archive className="w-5 h-5" />
            Archived ({archivedItemCount})
          </button>
        </div>
      </div>

      {/* Statistics */}
      {activeTab === 'accounts' && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="text-4xl font-bold text-blue-600">{users.length}</p><p className="mt-2 text-base text-slate-600">Total Users</p></div>
              <span className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-600"><Users className="h-6 w-6" /></span>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="text-4xl font-bold text-emerald-600">{users.filter(u => u.status === 'Active').length}</p><p className="mt-2 text-base text-slate-600">Active Users</p></div>
              <span className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-600"><CheckCircle2 className="h-6 w-6" /></span>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="text-4xl font-bold text-indigo-600">{users.filter(u => u.role === 'Head Engineer').length}</p><p className="mt-2 text-base text-slate-600">Head Engineers</p></div>
              <span className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-indigo-600"><Award className="h-6 w-6" /></span>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div><p className="text-4xl font-bold text-slate-400">{users.filter(u => u.status === 'Inactive').length}</p><p className="mt-2 text-base text-slate-600">Inactive Users</p></div>
              <span className="rounded-2xl border border-slate-200 bg-slate-100 p-4 text-slate-400"><UserX className="h-6 w-6" /></span>
            </div>
          </div>
        </div>
      )}

      {/* Users List */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <h2 className="text-xl font-bold text-slate-900">All Users <span className="ml-2 text-sm font-medium text-slate-400">({users.length} active records)</span></h2>
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search..."
                  className="h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-12 pr-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <select aria-label="Filter users by role" value={userRoleFilter} onChange={e => setUserRoleFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700">{['All Roles', 'Head Engineer', 'Staff - Encoder', 'Staff - Inspector', 'Staff - Validator'].map(role => <option key={role}>{role}</option>)}</select>
              <select aria-label="Filter users by status" value={userStatusFilter} onChange={e => setUserStatusFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700">{['All Status', 'Active', 'Inactive'].map(status => <option key={status}>{status}</option>)}</select>
            </div>
            </div>
          </div>
          <div className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="max-w-full overflow-x-auto rounded-xl">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-700">{user.employeeId}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-[#0ea5e9]">{user.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold leading-5 text-blue-700 opacity-100">{getRoleDisplayName(user.role)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatus(user.id)}
                          title={user.status === 'Active' ? 'Click to deactivate' : 'Click to activate'}
                          className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-pointer ${
                            user.status === 'Active' ? 'bg-[#0ea5e9]/10 text-[#0ea5e9]' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {user.status}
                        </button>
                        {lockedUsers[user.username.toLowerCase()] && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-full bg-red-500/10 text-red-500">
                            <Lock className="w-3 h-3" />Locked
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex gap-2">
                        {lockedUsers[user.username.toLowerCase()] && user.role !== 'Head Engineer' && (
                          <button onClick={() => handleUnlock(user)} title="Unlock this account" className="text-green-500 hover:text-green-700 p-1" aria-label={`Unlock ${user.name}`}>
                            <Unlock className="w-5 h-5" />
                          </button>
                        )}
                        <button onClick={() => handleEditUser(user)} className="text-[#0ea5e9] hover:text-[#0284c7] p-1">
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleArchiveUser(user.id)}
                          disabled={user.email.toLowerCase() === currentUserEmail.toLowerCase()}
                          title={user.email.toLowerCase() === currentUserEmail.toLowerCase() ? 'You cannot archive your own account' : 'Archive this account'}
                          aria-label={user.email.toLowerCase() === currentUserEmail.toLowerCase() ? 'Cannot archive your own account' : `Archive ${user.name}`}
                          className="p-1 text-slate-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Archive className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Activity Logs Tab */}
      {activeTab === 'activity' && (
        <div className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#0ea5e9]">Activity Logs</h2>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" aria-label="Filter by user" className="inline-flex min-w-44 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-medium text-slate-700">{selectedActivityAccount?.name || 'All Users'}<ChevronDown className="h-4 w-4" /></button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52 bg-white text-slate-700">
                  <DropdownMenuItem onSelect={() => setActivityUserFilter('All Users')} className="justify-between">All Users {activityUserFilter === 'All Users' && <Check className="h-4 w-4 text-blue-600" />}</DropdownMenuItem>
                  {activityRoleGroups.map(({role, accounts}) => <DropdownMenuSub key={role}>
                    <DropdownMenuSubTrigger>{role}</DropdownMenuSubTrigger>
                    <DropdownMenuPortal><DropdownMenuSubContent className="min-w-52 bg-white text-slate-700">
                      {accounts.length ? accounts.map(user => <DropdownMenuItem key={user.id} onSelect={() => setActivityUserFilter(user.id)}>{user.name}{activityUserFilter === user.id && <Check className="ml-auto h-4 w-4 text-blue-600" />}</DropdownMenuItem>) : <DropdownMenuItem disabled>No registered users</DropdownMenuItem>}
                    </DropdownMenuSubContent></DropdownMenuPortal>
                  </DropdownMenuSub>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label className="relative w-[190px] max-w-full shrink-0">
                  <CalendarDays aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-500" />
                  <input type="date" ref={activityDateRef} min="1000-01-01" max="9999-12-31" aria-label="Filter activity logs by date"
                    onChange={event => { if (event.currentTarget.value && event.currentTarget.validity.valid) setActivityDateFilter(event.currentTarget.value); }}
                    onBlur={event => { if (!event.currentTarget.value) setActivityDateFilter(''); }}
                    className="h-auto min-h-[46px] w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-2 text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 sm:w-[190px]" />
                </label>
                {activityDateFilter && <button type="button" onClick={() => { if (activityDateRef.current) activityDateRef.current.value = ''; setActivityDateFilter(''); }} className="shrink-0 text-sm font-medium text-blue-700 hover:text-blue-900">Clear</button>}
              </div>
            </div>
          </div>
          <div className="max-w-full overflow-x-auto rounded-xl">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredActivityLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-400" />
                        <span className="font-medium text-[#0ea5e9]">{log.user}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.action}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{log.timestamp}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{log.details}</td>
                  </tr>
                ))}
                {filteredActivityLogs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-500">
                      {activityLoading ? 'Loading activity logs...' : activityError || (activityDateFilter || activityUserFilter !== 'All Users'
                        ? 'No activity logs match the selected filters.'
                        : 'No activity logs available.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Archived Users Tab */}
      {activeTab === 'archived' && (
        <div className="min-w-0 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-bold text-[#0ea5e9]">Archived Records</h2>
            <div className="flex items-center gap-3">
              <Select value={archiveFilter} onValueChange={(value: 'users' | 'projects' | 'inspections' | 'maintenance') => setArchiveFilter(value)}>
                <SelectTrigger id="archived-record-filter" aria-label="Archived record type" className="w-36">
                  <SelectValue placeholder="Select record type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="users">User ({archivedUsers.length})</SelectItem>
                  <SelectItem value="projects">Project ({archivedRecords.length})</SelectItem>
                  <SelectItem value="inspections">Inspections ({archivedInspections.length})</SelectItem>
                  <SelectItem value="maintenance">Maintenance ({archivedMaintenance.length})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mb-5 text-center text-sm text-gray-500">
            Archived records are kept for 30 days and then deleted automatically, with their files. Restore one before its deletion date to keep it.
          </p>
          {archiveFilter === 'users' && (
            <section>
              <h3 className="mb-4 text-lg font-bold text-[#0ea5e9]">Archived Users ({archivedUsers.length})</h3>
              {archivedUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Archive className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No archived users</p>
                </div>
              ) : (
                <div className="max-w-full overflow-x-auto rounded-xl">
                  <table className="w-full border-separate border-spacing-0">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {archivedUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-gray-400" />
                              <span className="font-medium text-[#0ea5e9]">{user.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.username}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold leading-5 text-blue-700 opacity-100">{getRoleDisplayName(user.role)}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.createdDate}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleRestoreUser(user.id)} type="button" aria-label={`Restore ${user.name}`} title="Restore" className="inline-flex items-center rounded-lg p-2 text-green-700 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                              <button onClick={() => handleDeleteArchivedUser(user.id)} type="button" className="inline-flex items-center rounded-lg p-2 text-red-700 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600" aria-label={`Delete permanently ${user.name}`} title="Delete permanently">
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {archiveFilter === 'projects' && (
          <div className="border-t border-slate-200 pt-6">
            <h2 className="mb-4 text-xl font-bold text-[#0ea5e9]">Archived Project Records ({archivedRecords.length})</h2>
            {archivedRecords.length === 0 ? (
              <div className="py-12 text-center"><Archive className="mx-auto mb-4 h-12 w-12 text-gray-300" aria-hidden="true" /><p className="text-gray-500">No archived project records</p></div>
            ) : (
              <div className="max-w-full overflow-x-auto rounded-xl">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="w-48 max-w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Project</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Category</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Location</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Deletes</th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {archivedRecords.map((record) => (
                      <tr key={record.id}>
                        <td className="w-48 max-w-48 break-words px-4 py-4 text-sm font-medium text-slate-700">{record.projectName || record.roadName || record.name || 'Unnamed project'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{record.projectCategory || '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{record.location || '—'}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{purgeScheduleLabel(record.archivedAt) || '—'}</td>
                        <td className="px-6 py-4 text-sm">
                          <button onClick={() => handleRestoreRecord(record.id)} type="button" aria-label={`Restore ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Restore" className="mr-2 inline-flex items-center rounded-lg p-2 text-green-700 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                          <button onClick={() => confirmDeleteArchivedRecord('project', record)} type="button" aria-label={`Delete permanently ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Delete permanently" className="inline-flex items-center rounded-lg p-2 text-red-700 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </div>
            )}
          </div>
          )}
          {archiveFilter === 'inspections' && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-4 text-xl font-bold text-[#0ea5e9]">Archived Inspections ({archivedInspections.length})</h2>
              {archivedInspections.length === 0 ? <div className="py-12 text-center"><Archive className="mx-auto mb-4 h-12 w-12 text-gray-300" aria-hidden="true" /><p className="text-gray-500">No archived inspections</p></div> : (
                <div className="max-w-full overflow-x-auto rounded-xl">
                  <table className="w-full border-separate border-spacing-0">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="w-48 max-w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Project</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Inspection Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Deletes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {archivedInspections.map((record) => (
                        <tr key={record.id}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">{record.projectName || record.localRoadName || record.roadName || record.name || 'Unnamed project'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{record.date || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{purgeScheduleLabel(record.archivedAt) || '—'}</td>
                          <td className="px-6 py-4 text-sm">
                            <button onClick={async () => { await fetch('/api/inspections', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id, action: 'restore' }) }); await refreshArchivedRecords(); window.dispatchEvent(new Event('local-road-records-changed')); }} type="button" aria-label={`Restore ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Restore" className="mr-2 inline-flex items-center rounded-lg p-2 text-green-700 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => confirmDeleteArchivedRecord('inspection', record)} type="button" aria-label={`Delete permanently ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Delete permanently" className="inline-flex items-center rounded-lg p-2 text-red-700 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {archiveFilter === 'maintenance' && (
            <section className="border-t border-slate-200 pt-6">
              <h2 className="mb-4 text-xl font-bold text-[#0ea5e9]">Archived Maintenance ({archivedMaintenance.length})</h2>
              {archivedMaintenance.length === 0 ? <div className="py-12 text-center"><Archive className="mx-auto mb-4 h-12 w-12 text-gray-300" aria-hidden="true" /><p className="text-gray-500">No archived maintenance records</p></div> : (
                <div className="max-w-full overflow-x-auto rounded-xl">
                  <table className="w-full border-separate border-spacing-0">
                    <thead className="border-b border-gray-200 bg-gray-50">
                      <tr>
                        <th className="w-48 max-w-48 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Project</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Scheduled Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Completed Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Deletes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {archivedMaintenance.map((record) => (
                        <tr key={record.id}>
                          <td className="px-6 py-4 text-sm font-medium text-slate-700">{record.projectName || record.localRoadName || record.roadName || record.name || 'Unnamed project'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{record.scheduledDate || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{record.completedDate || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{record.status || '—'}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{purgeScheduleLabel(record.archivedAt) || '—'}</td>
                          <td className="px-6 py-4 text-sm">
                            <button onClick={async () => { await fetch('/api/maintenance', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: record.id, action: 'restore' }) }); await refreshArchivedRecords(); window.dispatchEvent(new Event('local-road-records-changed')); }} type="button" aria-label={`Restore ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Restore" className="mr-2 inline-flex items-center rounded-lg p-2 text-green-700 hover:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button>
                            <button onClick={() => confirmDeleteArchivedRecord('maintenance', record)} type="button" aria-label={`Delete permanently ${record.projectName || record.localRoadName || record.name || 'record'}`} title="Delete permanently" className="inline-flex items-center rounded-lg p-2 text-red-700 hover:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Add/Edit User Modal */}
      {showAddForm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="user-account-modal my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-[405px] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-3 text-white">
              <div className="flex items-center gap-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 bg-white/15 text-white shadow-inner">
                  <User className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold leading-tight">
                    {editingUser ? 'Edit User Account' : 'Create User Account'}
                  </h2>
                  <p className="text-sm text-blue-100">Office of the Municipal Engineer Personnel</p>
                </div>
              </div>
              <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/85 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close form">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div ref={userFormScrollRef} onScroll={updateActiveUserFormTab} className="form-modal-fields min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <section ref={userAccountSectionRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600">Employee ID</label>
                <input
                  type="text"
                  value={editingUser ? editingUser.employeeId : generatedEmployeeId}
                  readOnly
                  className="h-10 w-full rounded-md border border-slate-300 bg-gray-100 px-4 text-sm text-slate-700 outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                {/* @mine — the handle is derived from this name and must be unique. */}
                <p className="mt-1 text-xs text-slate-500">The username is this name in lower case, and must be unique across accounts.</p>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Password</label>
                <div className="relative">
                  <input
                    type={showUserPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="h-10 w-full rounded-md border border-slate-300 bg-white px-4 py-2 pr-11 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUserPassword((visible) => !visible)}
                    aria-label={showUserPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:text-blue-600"
                  >
                    {showUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {editingUser && (
                  // @mine — editing used to ignore this field entirely; the server now
                  // writes it to auth.users, so say so (and that blank keeps the old one).
                  <p className="mt-1 text-xs text-slate-500">
                    Leave blank to keep the current password. If you set one, it must be at least 8 characters.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Role</label>
                <Select
                  disabled={Boolean(editingUser && editingUser.email.toLowerCase() === currentUserEmail.toLowerCase())}
                  value={formData.role}
                  onValueChange={(value) => setFormData({ ...formData, role: value as UserData['role'] })}
                >
                  <SelectTrigger aria-label="Role" className="h-10 rounded-md border-slate-300 px-4 text-sm text-slate-700">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {AVAILABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                      {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-semibold text-slate-600">Status</label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as UserData['status'] })}
                >
                  <SelectTrigger aria-label="Status" className="h-10 rounded-md border-slate-300 px-4 text-sm text-slate-700">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active (Login Enabled)</SelectItem>
                    <SelectItem value="Locked">Locked (Pending Approval)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </section>
            </div>

            <div className="flex shrink-0 gap-3 px-6 pb-6 pt-4">
              <button
                onClick={handleClose}
                className="h-10 flex-1 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={editingUser ? handleSaveEdit : handleAddUser}
                disabled={savingUser}
                className="h-10 flex-1 rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm transition-colors hover:bg-blue-700"
              >
                {savingUser ? (editingUser ? 'Updating...' : 'Saving...') : (editingUser ? 'Save Changes' : 'Create Account')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showPasswordForm && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="my-auto flex h-auto max-h-[calc(100vh-2rem)] w-full max-w-[840px] flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-3 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/15 text-blue-300 shadow-inner backdrop-blur-md">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold leading-tight text-white">Master Security Key</h2>
                  <p className="text-sm text-blue-100">Emergency Municipal Access Token</p>
                </div>
              </div>
              <button onClick={handleClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="form-modal-fields space-y-4 px-6 py-5">
              <p className="text-xs leading-relaxed text-slate-500">
                The master token enables emergency administrative recovery and role-override privileges for the Office of the Municipal Engineer.
              </p>
              {masterCodeConfigured === false && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                  No master code has been set yet. Leave <strong>Current Master Password</strong> blank and choose one now —
                  it is what unlocks a locked account from the login screen.
                </p>
              )}
              {masterCodeConfigured === true && (
                <p className="text-xs leading-relaxed text-slate-500">
                  A master code is already set. Enter it below to replace it.
                </p>
              )}
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">Current Master Password</label>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600"
                  placeholder={masterCodeConfigured === false ? "Not set yet — leave blank" : "Enter current master code"}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">New Master Password</label>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600"
                  placeholder="At least 8 characters"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2 text-xs font-mono text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-blue-600"
                  placeholder="Repeat new master token"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
              <button
                  type="button"
                  onClick={handleClose}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-200"
              >
                  Cancel
              </button>
              <button
                  type="button"
                  onClick={handlePasswordUpdate}
                  disabled={savingPassword}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800"
              >
                  {savingPassword ? 'Updating...' : 'Update Master Password'}
              </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Dialog Modal */}
      {dialog.isOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[110] flex min-h-screen items-center justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-2xl">
            <div className="mb-4">
              <h2 className={`text-xl font-bold ${
                dialog.type === 'error' ? 'text-red-600' :
                dialog.type === 'confirmation' ? 'text-slate-900' :
                'text-green-600'
              }`}>
                {dialog.title}
              </h2>
            </div>

            <div className="mb-6">
              <p className="text-gray-700 text-base leading-relaxed">
                {dialog.message}
              </p>
            </div>

            <div className={`flex ${dialog.type === 'confirmation' ? 'justify-end gap-2' : 'justify-end gap-3'}`}>
              {dialog.type === 'confirmation' && (
                <>
                  <button
                    onClick={() => {
                      dialog.onCancel?.();
                      setDialog({ ...dialog, isOpen: false });
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      dialog.onConfirm?.();
                      setDialog({ ...dialog, isOpen: false });
                    }}
                    className={`rounded-xl px-4 py-2 font-medium text-white transition-colors ${
                      dialog.title === 'Confirm Unlock'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {dialog.title === 'Archive User' ? 'Archive' :
                      dialog.title.startsWith('Delete Archived ') ? 'Delete' :
                        dialog.title === 'Confirm Unlock' ? 'Unlock' : 'Confirm'}
                  </button>
                </>
              )}
              {dialog.type !== 'confirmation' && (
                <button
                  onClick={() => setDialog({ ...dialog, isOpen: false })}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    dialog.type === 'error'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
