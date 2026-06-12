// Demo data matching the employee roster visible in the reference screenshots.
// Used by Settings -> Reset Demo Data, and mirrored in supabase/seed.sql.

export const SEED_BUSINESSES = [
  { name: 'Home Stay Hotel' },
  { name: 'The Resthouse Zamboanga' },
]

export const SEED_EMPLOYEES = [
  // Home Stay Hotel
  { full_name: 'Lei Renales', business: 'Home Stay Hotel', department: 'Front Office', position: 'Receptionist', pay_type: 'fixed', rate: 13000, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Angel Gabule', business: 'Home Stay Hotel', department: 'Housekeeping', position: 'Room Attendant', pay_type: 'daily', rate: 450, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Aldrick Dela Cruz', business: 'Home Stay Hotel', department: 'Maintenance', position: 'Handy Man', pay_type: 'fixed', rate: 12000, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Ino Neri', business: 'Home Stay Hotel', department: 'Front Office', position: 'Receptionist', pay_type: 'fixed', rate: 12500, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Romeo Suabig', business: 'Home Stay Hotel', department: 'Maintenance', position: 'Maintenance Staff', pay_type: 'daily', rate: 500, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Mary Grace Lim', business: 'Home Stay Hotel', department: 'Housekeeping', position: 'Room Attendant', pay_type: 'daily', rate: 450, employment_status: 'Probationary', sss_enabled: false, philhealth_enabled: false, pagibig_enabled: false, notes: '', status: 'active' },
  { full_name: 'Jonas Bernardo', business: 'Home Stay Hotel', department: 'Security', position: 'Security Guard', pay_type: 'fixed', rate: 11000, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Carla Mendoza', business: 'Home Stay Hotel', department: 'Front Office', position: 'Night Receptionist', pay_type: 'fixed', rate: 12000, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'archived' },
  // The Resthouse Zamboanga
  { full_name: 'Arnel Ramos', business: 'The Resthouse Zamboanga', department: 'Security', position: 'Security', pay_type: 'per_unit', rate: 300, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: 'Paid per occupied day', status: 'active' },
  { full_name: 'Grace Chiong', business: 'The Resthouse Zamboanga', department: 'Housekeeping', position: 'Room Attendant', pay_type: 'per_unit', rate: 250, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: 'Paid per occupied day / booking', status: 'active' },
  { full_name: 'Dario Atilano', business: 'The Resthouse Zamboanga', department: 'Grounds', position: 'Caretaker', pay_type: 'fixed', rate: 10000, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Jessa Marie Torres', business: 'The Resthouse Zamboanga', department: 'Housekeeping', position: 'Room Attendant', pay_type: 'per_unit', rate: 250, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Ramil Bucoy', business: 'The Resthouse Zamboanga', department: 'Maintenance', position: 'Handy Man', pay_type: 'daily', rate: 480, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Nina Alvarez', business: 'The Resthouse Zamboanga', department: 'Front Office', position: 'Booking Coordinator', pay_type: 'fixed', rate: 11500, employment_status: 'Regular', sss_enabled: true, philhealth_enabled: true, pagibig_enabled: true, notes: '', status: 'active' },
  { full_name: 'Peter Sebastian', business: 'The Resthouse Zamboanga', department: 'Grounds', position: 'Gardener', pay_type: 'daily', rate: 420, employment_status: 'Contractual', sss_enabled: false, philhealth_enabled: false, pagibig_enabled: false, notes: '', status: 'archived' },
]

// Cash advances for the current demo cutoff (June 2026, 1st cutoff).
export const SEED_CASH_ADVANCES = [
  { employee: 'Lei Renales', date: '2026-06-03', amount: 5000, reason: 'Personal', year: 2026, month: 6, cutoff: 1, notes: '' },
  { employee: 'Aldrick Dela Cruz', date: '2026-06-05', amount: 3000, reason: 'Personal', year: 2026, month: 6, cutoff: 1, notes: '' },
  { employee: 'Ino Neri', date: '2026-06-06', amount: 1200, reason: 'Medical', year: 2026, month: 6, cutoff: 1, notes: '' },
  { employee: 'Romeo Suabig', date: '2026-06-08', amount: 1000, reason: 'Personal', year: 2026, month: 6, cutoff: 1, notes: '' },
  { employee: 'Angel Gabule', date: '2026-06-09', amount: 1500, reason: 'Emergency', year: 2026, month: 6, cutoff: 1, notes: '' },
  { employee: 'Grace Chiong', date: '2026-06-10', amount: 800, reason: 'Personal', year: 2026, month: 6, cutoff: 2, notes: '' },
]
