import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import { fetchPublicSupportSettings } from '../services/api/settings';
import { useHeaderTop } from '../hooks/useHeaderTop';
import { useData } from './context/DataContext';

// =========================================================
// 🔥 DEFAULT FALLBACK
// =========================================================
const DEFAULTS = {
    supportPhone: '919999999999',
    supportEmail: 'support@yourcompany.com',
    userManualUrl: 'https://lifelinem.com/crm/LMS-CRM-User-Manual.pdf',
    videoTutorialUrl: '', // no video yet: the card stays hidden until Super Admin sets a link
};
// Fixed name on the website; replace the file there to update it.
const SETUP_GUIDE_URL = 'https://lifelinem.com/crm/LMS-CRM-Setup-Guide.pdf';

// =========================================================
// 🗂 CATEGORIES — shared by User Guide and FAQ. A topic shows only when the
// company has its module (HR / Sales / Service); 'common' is always shown.
// `keywords` make search work with everyday / Hinglish words too.
// =========================================================
type HelpModule = 'common' | 'hr' | 'sales' | 'service';
type CatKey = 'start' | 'attendance' | 'leaves' | 'payroll' | 'expenses' | 'office' | 'sales' | 'orders' | 'service' | 'reports' | 'admin';

const CATEGORIES: { key: CatKey; label: string; icon: any; module: HelpModule; keywords: string }[] = [
    { key: 'start', label: 'Getting Started', icon: 'rocket', module: 'common', keywords: 'login password app web laptop computer notification profile slow photo shuru start setup first kaise excel upload template sample' },
    { key: 'attendance', label: 'Attendance & Tracking', icon: 'finger-print', module: 'hr', keywords: 'day in day out hajri haziri gps location map km shift weekly off' },
    { key: 'leaves', label: 'Leaves', icon: 'calendar', module: 'hr', keywords: 'chutti leave cl sl el half day holiday balance' },
    { key: 'payroll', label: 'Payroll & Salary', icon: 'cash', module: 'hr', keywords: 'salary tankhwah payslip overtime late deduction bank full final' },
    { key: 'expenses', label: 'Expenses, Advance & Travel', icon: 'receipt', module: 'hr', keywords: 'kharcha bill claim advance travel petrol da hotel approval' },
    { key: 'office', label: 'Courier, Quotations & Cards', icon: 'cube', module: 'hr', keywords: 'courier docket challan quotation estimate visiting card stationery' },
    { key: 'sales', label: 'Leads & Sales', icon: 'trending-up', module: 'sales', keywords: 'lead customer hospital visit dsr cold call demo target pipeline website' },
    { key: 'orders', label: 'Orders & Payments', icon: 'cart', module: 'sales', keywords: 'order po payment paisa receipt due balance cheque advance collection' },
    { key: 'service', label: 'Service & Spares', icon: 'construct', module: 'service', keywords: 'service call complaint engineer machine installation pms spare part stock' },
    { key: 'reports', label: 'Reports & PDFs', icon: 'document-text', module: 'common', keywords: 'report pdf excel export history timeline serial' },
    { key: 'admin', label: 'Admin & Settings', icon: 'shield-checkmark', module: 'common', keywords: 'admin employee user role permission company profile logo subscription plan whatsapp email import' },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<CatKey, (typeof CATEGORIES)[number]>;

// notIos: buying a plan is not offered in the iPhone app (App Store rule), so its help is hidden there.
// intro / note: plain text above / below the numbered steps (not numbered).
type GuideSection = { cat: CatKey; module?: HelpModule; icon: string; color: string; title: string; intro?: string; steps: string[]; note?: string; notIos?: boolean };
type FaqItem = { cat: CatKey; module?: HelpModule; q: string; a: string; notIos?: boolean };

// =========================================================
// 📋 USER GUIDE SECTIONS
// =========================================================
const GUIDE_SECTIONS: GuideSection[] = [
    {
        icon: 'flag',
        color: '#0d47a1',
        cat: 'start',
        title: 'Start Here — First Setup, Step by Step',
        intro: 'Do these 10 steps once, in this order, before your team starts using the app. Each step has its own guide below if you need more detail.',
        steps: [
            'Company Profile: Sidebar → Company Profile. Fill name, address, phone, email, GST and bank details; upload logo, signature and UPI QR. These print on every PDF.',
            'Office location: in Company Profile tap "Set Office Location" while standing in your office. Day In is then tagged Office or Field automatically.',
            'Weekly off & shift: Payroll → Salary Rules → "Weekly Off & Shift". Set weekly off days and shift start / end (e.g. 10:00 – 18:00). Late marks, leave counting and the Day In / Day Out reminders all use this. Different shifts or night shifts: use the Shift Roster.',
            'Holidays: Team & Settings → Setup → Holidays (upload the Excel), so nobody is marked absent or reminded on a holiday.',
            'Add employees: Team & Settings → Users → "+" (or many at once from Excel in Team & Settings → Setup). Pick the right role and joining date; the email and password are their login.',
            'Permissions: Team & Settings → Permissions. For each role (Sales Executive, Service Engineer, Accountant, Store Keeper, HR, Manager) tick only the screens they need, e.g. Courier for HR / Store.',
            'Alerts: Team & Settings → Alerts. Keep the daily alerts you want and set their times. The Day In / Day Out reminders go to each employee after their shift starts / ends; the time shown there is only for staff without a shift.',
            'Your data: Products / price list (Product Master or Excel), spare parts, and your customers (Sidebar → Org → "Add New", or scan a visiting card).',
            'Payroll & leave (if you use it): Payroll → Salary Rules for late, absent, overtime and the CL / SL / EL leave policy; enter salaries in each employee.',
            'Team login: everyone installs the app from Google Play (or opens app.lifelinem.com on a laptop), logs in, and allows Notifications and Location when asked. Without these there are no reminders and no Day In.',
        ],
        note: 'Optional — WhatsApp & Email automation (add-on) to send order, payment and service updates to customers automatically.',
    },
    {
        icon: 'cloud-upload',
        color: '#2e7d32',
        cat: 'start',
        title: 'Set Up Everything at Once with Excel',
        steps: [
            'Go to Sidebar → Team & Settings → Setup tab. You will see Company Profile, Employees, Products / Price List and Holidays.',
            'Company Profile: tap "Download Company Sheet", fill the "Value" column in Excel and upload it.',
            'Employees, Products and Holidays: open each one, tap "Download Template" (Step 1) and fill the sample sheet in Excel.',
            'Upload each filled sheet (Step 2). Check the preview and confirm — your company profile, users, products and holidays are added in one go.',
            'New employees added from Excel get a starting password, shown on screen after the upload. Share it with them.',
            'Logo, signature, UPI QR code and office location are added in Company Profile itself, not in Excel.',
        ],
    },
    {
        icon: 'laptop',
        color: '#37474f',
        cat: 'start',
        title: 'Use the App on a Laptop / Computer (Web)',
        steps: [
            'Open https://app.lifelinem.com in Chrome or Edge and log in with the same email and password as the phone app.',
            'All your data is the same as on the phone — lists, reports, Excel export, approvals and PDFs (PDFs open the print window; choose "Save as PDF").',
            'Maps, push notifications and Day In / Day Out location tracking work only in the phone app.',
            'Tip: pin the page to your browser bookmarks bar for quick access.',
        ],
    },
    {
        icon: 'wallet',
        color: '#9c27b0',
        cat: 'expenses',
        title: 'Advance Request',
        steps: [
            'Go to "Advance" and tap + to request money in advance. Enter the amount, date and reason.',
            'Admin and Account get a notification. They approve or reject it and can set a monthly deduction amount.',
            'You get a notification when it is approved or rejected. Approved advances are recovered from salary as set by the office.',
        ],
    },
    {
        icon: 'bicycle',
        color: '#ff9800',
        cat: 'expenses',
        title: 'Travel Log',
        steps: [
            'Go to "Travel Log" and add each trip: from, to, mode, distance (km), amount and purpose.',
            'Admin and Account are notified. They can settle all pending trips of an employee in one tap.',
            'You get a notification when your travel claims are settled.',
        ],
    },
    {
        icon: 'briefcase',
        color: '#3b5998',
        cat: 'sales',
        title: 'Visits DSR / Cold Call',
        steps: [
            'Go to "Visits DSR" and tap + to log a visit or cold call: hospital, contact person, outcome and next follow-up date.',
            'A positive outcome creates a lead automatically. If you already have an open lead for that hospital, the visit is added to that lead instead of creating a duplicate.',
            'Admin / Manager can filter by employee and period, and compare visits with targets.',
        ],
    },
    {
        icon: 'play-circle',
        color: '#00bcd4',
        cat: 'sales',
        title: 'Demo Report',
        steps: [
            'Go to "Demo Report" and tap + after a product demo. Choose the hospital and product, and enter the result and notes.',
            'A demo number for the financial year is created automatically and a PDF can be shared.',
            'Admin and Manager get a notification for every demo.',
        ],
    },
    {
        icon: 'calendar-number',
        color: '#5e35b1',
        cat: 'start',
        title: 'Activity Plan',
        steps: [
            'Open "Act Plan" from the bottom bar and tap + to plan a visit, demo, installation or service for a date.',
            'Tabs: Today, Upcoming, Completed and All. Start Journey when you leave, then fill the report — the plan is marked Completed automatically.',
            'Admin and Manager are notified when you plan an activity.',
        ],
    },
    {
        icon: 'checkbox',
        color: '#e91e63',
        cat: 'start',
        title: 'Tasks',
        steps: [
            'Open "Task" from the bottom bar. "Received" shows tasks given to you, "Assigned" shows tasks you gave.',
            'Tap + to assign a task to a colleague with a due date — they get a notification.',
            'When done, open the task and tap Complete with a short note — the person who assigned it is notified.',
        ],
    },
    {
        icon: 'card',
        color: '#795548',
        cat: 'office',
        title: 'Visiting Cards & Stationery',
        steps: [
            'Go to "Cards" and tap + to request visiting cards or stationery, with the delivery address.',
            'Admin and Store are notified. When they dispatch it with the courier / tracking number, you get a notification.',
            'Tap "Received" when it reaches you.',
        ],
    },
    {
        icon: 'map',
        color: '#2e7d32',
        cat: 'attendance',
        title: 'Employee Day Map (Tracking)',
        steps: [
            'Admin / Manager: Team & Settings → Live Map tab → choose an employee and a date to see the route on the map with the total km.',
            'Points come from Day In / Day Out, visits, orders, payments and the on-duty location every 30 minutes.',
            'Wrong GPS jumps (very far or too fast) are ignored, so the km may be less than the raw points suggest.',
        ],
    },
    {
        icon: 'finger-print',
        color: '#4caf50',
        cat: 'attendance',
        title: 'Attendance (Day In / Day Out)',
        steps: [
            'Go to "Attendance" and tap Day In when you start work, Day Out when you finish.',
            'Make sure internet and GPS (Location) are turned ON before marking attendance.',
            'If it fails, close the app fully, reopen it, then try again.',
            'In low signal areas, move to a better coverage spot before marking.',
            'Your attendance status (Logged In / Logged Out / Not Marked) is visible directly on the home screen banner — no need to open the attendance screen to check.',
            'After Day In, the app shows a one-time explanation and then a notification "LMS — on duty". While it is shown, your location is shared every 30 minutes so your manager can see field visits. It stops by itself at Day Out.',
            'If the app cannot get your location it tells you what to do (turn on Location, allow permission, or turn on "Google Location Accuracy" and step near a window). Day Out still saves even without GPS.',
            'While Day In / Day Out is saving, the screen shows the step ("Getting your location…", "Saving Day In…"). If the network drops, the app tries once more by itself. If it still fails, the message says why: no internet, server slow, login expired or plan expired.',
            'Night shift (e.g. 22:00 – 06:00): Day In at night, Day Out the next morning on the same screen — the entry stays open past midnight. A Day In after midnight (e.g. 00:30) is counted in last night\'s shift and marked late.',
            'Forgot Day Out? The entry closes by itself a few hours after your shift ends, with Day Out = shift end, and is marked "Auto closed".',
        ],
    },
    {
        icon: 'business',
        color: '#1565c0',
        cat: 'admin',
        title: 'Company Profile — Setup & Logo',
        steps: [
            'Go to Sidebar → "Company Profile" to set up your company details.',
            'Fill in Company Name, Address, Phone, Email, GST Number, and Website carefully — these details appear on every PDF: Payment Receipt, Delivery Challan, Order, Installation, PMS, Service, and Demo Reports.',
            'Upload your Company Logo — it appears on the top of all PDF documents.',
            'Upload your Signature image — it appears at the bottom of PDFs as the authorized signatory.',
            'Add Bank Details (Account No, IFSC, Bank Name, Branch) — these appear on Payment Receipts and Challans.',
            'Upload your UPI QR Code image — shown in the Payment Collection screen so clients can scan and pay directly.',
            'Optional — 🌐 Social Media & Online Stores (bottom of the screen): add your Facebook, Instagram, YouTube, LinkedIn, Telegram, IndiaMART, TradeIndia and ExportersIndia links. They appear as buttons in customer emails such as Order Confirmation; empty ones are hidden.',
            'Tap Save after filling all details. Any update here reflects immediately across all modules.',
        ],
    },
    {
        icon: 'qr-code',
        color: '#00796b',
        cat: 'admin',
        title: 'Company QR Code & Payment Sharing',
        steps: [
            'Your company UPI QR Code is visible at the top of the "Collect Payment" screen.',
            'Any team member can open this screen and show the QR code to the client for scanning.',
            'Tap the Share button next to the QR code to send it via WhatsApp, Email, or any other app — useful for remote payment collection.',
            'To update the QR code image, go to Sidebar → Company Profile → upload a new QR Code image and save.',
        ],
    },
    {
        icon: 'person-add',
        color: '#7b1fa2',
        cat: 'admin',
        title: 'Adding New Users / Employees',
        steps: [
            'Go to Sidebar → Team & Settings → Users tab.',
            'Tap the "+" icon (top right) to add a new employee.',
            'Fill in the employee\'s Name, Email ID, Password, Mobile Number, and Role.',
            'The email and password you set here are the login credentials for that employee.',
            'The new employee downloads the app from the Google Play Store and logs in using the email and password you created.',
            'Each employee must have a unique email ID — duplicate emails are not allowed.',
            'If the employee limit is reached, increase employees in Sidebar → Plan & Renewal, or contact support.',
        ],
    },
    {
        icon: 'create',
        color: '#f57c00',
        cat: 'admin',
        title: 'Edit Employee — Role, Target, Leave Balance',
        steps: [
            'Go to Sidebar → Team & Settings → Users tab.',
            'Tap on the employee whose details you want to change.',
            'From here you can change their Role, Monthly Sales Target, Leave Balance, Mobile Number, and other details.',
            'For a Field User choose the Designation — "Sales Executive" or "Service Engineer". It decides their screens and the title on their profile and visiting card. They should log out and log in once after it changes.',
            'Also here: "Visits / day" and "Visits / month" targets, and "Weekly off & shift" (company default or their own schedule). Tap "📊 360" on the card to see everything about the employee.',
            'Tap Save after making changes — the employee will see updated details on their next app open.',
            'To reset or change their password, use the edit option and enter a new password.',
        ],
    },
    {
        icon: 'shield-checkmark',
        color: '#c62828',
        cat: 'admin',
        title: 'Permissions — Control What Each Employee Sees',
        steps: [
            'Go to Sidebar → Team & Settings → Permissions tab. Only available to Admins.',
            'Select any role (Sales Executive, Service Engineer, Accountant, Store Keeper, etc.) to control what screens and features that role can access.',
            'Toggle any module ON or OFF — for example, hide "Payment Dues" from Sales team, or show "Orders" to Accountants.',
            'You can also set permissions for individual employees — user-specific settings override role settings.',
            'Activity Plan and Tasks (bottom bar) are ON for everyone until you switch them off here.',
            'Employees need to close and reopen the app for permission changes to take effect.',
        ],
    },
    {
        icon: 'eye',
        color: '#2e7d32',
        cat: 'admin',
        title: 'Admin / Manager — Viewing All Team Data',
        steps: [
            'Admins and Managers can see data from all employees across all modules — Orders, Payments, Attendance, Leaves, Service Calls, etc.',
            'Accountants can also be given access to financial data (Orders, Payments, Dues) from the Permissions tab.',
            'Regular employees (Sales, Service) only see their own entries by default.',
            'To give a specific employee access to all data, go to Team & Settings → Permissions and enable the required modules for their role.',
        ],
    },
    {
        icon: 'cart',
        color: '#ff9800',
        cat: 'orders',
        title: 'Order Booking',
        steps: [
            'Home → Sales → "Order Booking".',
            'Select the client/hospital from the list, or add a new one.',
            'Choose Cash or Credit sale, enter PO number, amount, and products.',
            'Tap Submit — the order is saved and the customer gets a WhatsApp/Email update automatically (if automation is enabled).',
            'The order PDF (Delivery Challan) will include your company name, logo, address, and bank details from Company Profile.',
            'Attaching the PO: tap Attach PO → Camera or Gallery. The PO is saved as a photo (made small automatically); a PDF cannot be attached — take a photo of the printed PO, or a screenshot of the PDF and pick it from the Gallery.',
            'Advance received at booking: enter the amount and how it was paid (Cash / UPI / NEFT / Cheque). It is saved as a payment with its own receipt number — you will see it in Collect Payment and in the order\'s Pending Due.',
        ],
    },
    {
        icon: 'cash',
        color: '#27ae60',
        cat: 'orders',
        title: 'Collect Payment',
        steps: [
            'Home → Sales → "Collect Payment".',
            'Select the client and enter the amount received.',
            'Choose payment mode (Cash, UPI, NEFT, Cheque) and add reference details if needed.',
            'Submitting will automatically reduce the client\'s pending dues.',
            'A Payment Receipt PDF is generated with your company logo, address, and bank details.',
        ],
    },
    {
        icon: 'time',
        color: '#c0392b',
        cat: 'orders',
        title: 'Pending Dues (Accountant)',
        steps: [
            'Home → Sales → "Pending Dues".',
            'Every approved order automatically creates a due entry — you do not need to add it manually.',
            'When a payment is collected, the due balance reduces automatically.',
            'Filter by client or status to see outstanding amounts at a glance.',
            'Admins and Accountants can see dues for all clients across the team.',
        ],
    },
    {
        icon: 'construct',
        color: '#795548',
        cat: 'service',
        title: 'Installation Report',
        steps: [
            'Home → Activity Report → "Installation".',
            'Select the client and product being installed.',
            'Add installation date, serial number, warranty expiry date and notes.',
            'Tip: tap "Scan Machine Label (S/N)" and photograph the machine\'s label — the serial number (and model, if found) are filled in for you. Check them before saving.',
            'Once saved, an Installation Report PDF can be generated with full company details from Company Profile.',
            'Fill the Warranty Expiry date carefully: 60 days before it ends, Service is alerted and an AMC lead is created for the salesperson who handles that hospital.',
        ],
    },
    {
        icon: 'settings',
        color: '#607d8b',
        cat: 'service',
        title: 'Service Call',
        steps: [
            'Tap "Service" in the bottom bar (or Sidebar → Service on a laptop) and tap "+ New".',
            'Select the client and machine, describe the problem, and add any spare parts already used.',
            'Photo (optional): tap the photo button and choose Camera or Gallery. Retake or remove it before saving.',
            'Admin / Manager: open a call → "Assign" to give it to an engineer. The engineer gets a notification that opens the call directly. Use "Change" or "Remove engineer" if needed.',
            'Each card shows the engineer and how long the call has been open ("Open 2 days" turns red after 48 hours), or how long it took to close.',
            'Tap "My Calls" to see only the calls assigned to you.',
            'To close: open the call, add the spare parts used (with quantity), write the action taken, and tap "Mark as Closed".',
            'Spare part stock is reduced automatically when you save or close — from your own stock first, then office stock.',
            'Admin / Manager: tap the 📊 icon for engineer performance — open calls, calls closed and average time to close.',
            'Service Report PDF includes the company header from Company Profile.',
        ],
    },
    {
        icon: 'build',
        color: '#ef6c00',
        cat: 'service',
        title: 'Spare Part Book & Stock',
        steps: [
            'Go to Sidebar → "Spare Part Book". Add parts with name, part number, price, compatible models and office stock.',
            'Admin / Manager / Store: open a part → "Issue to Employee" to hand stock to an engineer. Each engineer\'s stock is shown separately.',
            'Set "Low-stock alert at" on a part (e.g. 3). When office + engineers\' stock falls to that level, the part shows LOW STOCK and Store / Admin get a morning alert. 0 = no alert.',
            'Parts used on service calls are deducted automatically. Changing the quantity or removing a part later gives the stock back.',
            'In the part picker, use search (name, part number or model). Parts you carry appear first, then parts for that machine\'s model.',
            'Stock List → Office Stock: the list of machines kept at the office. Admin / Manager / Store can add a machine with its quantity or delete it.',
        ],
    },
    {
        icon: 'pie-chart',
        color: '#673ab7',
        cat: 'service',
        title: 'Service Analysis',
        steps: [
            'Home → Activity Report → "Service Analysis".',
            'See all service calls — open, closed, and pending — across machines and clients.',
            'Search by machine model, serial number, or client name to find service history of any specific machine.',
            'Admins and Service Managers can use this to track team performance and pending tickets.',
            'Filter by date range to see service activity for a specific period.',
        ],
    },
    {
        icon: 'pricetag',
        color: '#00838f',
        cat: 'reports',
        module: 'sales',
        title: 'Serial Number — Full Client & Machine Data',
        steps: [
            'Go to Sidebar → "Serial Number".',
            'To find a machine: enter the Serial Number in the search bar — all history (installation, service, PMS) appears.',
            'To find a client: tap the "Organization" tab, then type the organization/hospital name in the search bar.',
            'The client\'s full details appear — all orders, payments, installations, service calls, and PMS reports linked to that organization.',
            'Every employee can see a machine\'s full installation, service and PMS history (so engineers know the past before a call). Order, payment and due amounts are shown only to Admin, Manager and Accounts.',
            'This is the fastest way to get a complete picture of any client or machine.',
        ],
    },
    {
        icon: 'time',
        color: '#37474f',
        cat: 'reports',
        title: 'Employee Timeline',
        steps: [
            'Go to Sidebar → "Activity Timeline".',
            'Select any employee from the list.',
            'See a complete timeline of all their activities — visits, orders, payments, service calls, installations, attendance — sorted by date.',
            'Admins and Managers use this to review what a specific employee did on any given day.',
            'Filter by date range to check activity for a specific period.',
        ],
    },
    {
        icon: 'calculator',
        color: '#1565c0',
        cat: 'sales',
        title: 'Team Performance',
        steps: [
            'Home → Sales → "Team Performance".',
            'Shows a summary for every employee — total Orders, Sales Target, Achievement %, Payment Collections, and Pending Dues.',
            'Admins use this to compare team performance at a glance.',
            'Tap on any employee to drill down into their individual sales data.',
            'Filter by month to see monthly performance trends.',
        ],
    },
    {
        icon: 'stats-chart',
        color: '#1a237e',
        cat: 'sales',
        title: 'Live Dashboard & Sales Analysis',
        steps: [
            'Tap the blue "Live Dashboard" banner on the home screen.',
            'Shows today\'s summary — pending tasks, follow-ups, open tickets, dues — depending on your role.',
            'The Sales Analysis section shows each employee\'s orders, targets, and collection data.',
            'Admins can see what every team member has sold, collected, and achieved against their target.',
            'Refresh the home screen by pulling down to get the latest counts.',
            'The attendance status (Logged In / Logged Out / Not Marked) is shown directly on the banner.',
        ],
    },
    {
        icon: 'people',
        color: '#e91e63',
        cat: 'sales',
        title: 'Leads Management',
        steps: [
            'Open "Leads" from the bottom bar. The top cards show OVERDUE, DUE TODAY and HOT leads — tap a card to see only those.',
            'Newest leads are shown first. Tap the "Newest first" chip to switch to "Follow-up date" order (most overdue first).',
            'Use the Status, Stage and 🌐 Website chips to filter, and the search bar to find a hospital, contact person, mobile or city.',
            'Tap "+ Lead": choose "Cold Call / Visit" to log a visit (interested hospitals become leads), or "Add Lead Directly" for a phone enquiry or reference.',
            'While adding, the app warns if an open lead already exists for the same hospital or mobile — add to the existing lead instead of creating a duplicate.',
            'Open a lead and tap "Log Visit" to record the discussion, next follow-up date, stage and deal value (₹).',
            'When marking a lead Lost / Not Interested, choose a Lost Reason — it is used in Lead Insights and for re-contact reminders later.',
            'Admin / Manager: ⋮ menu → Reassign Leads (move one employee\'s leads to another), Close Stale Leads (mark old untouched leads Lost) and Website Leads.',
            'Every morning at 9 AM each salesperson gets a reminder of today\'s follow-ups and those missed in the last 7 days.',
        ],
    },
    {
        icon: 'albums',
        color: '#3949ab',
        cat: 'sales',
        title: 'Leads Board (Pipeline)',
        steps: [
            'Home → Sales → "Leads Board" (or Leads → "Board") shows open leads as columns: New → Introduction → Technical Review → Quotation → Negotiation.',
            'Each card shows the deal value; each column shows its total value.',
            'Long-press a card (or tap ⇄) to move it to another stage, with an optional note that goes into the lead\'s history.',
            'Use the search bar to find a lead across all columns. Admin / Manager can filter by employee.',
        ],
    },
    {
        icon: 'analytics',
        color: '#00897b',
        cat: 'sales',
        title: 'Lead Insights',
        steps: [
            'Leads → "📊 Insights" shows conversion rate, win rate, pipeline value and weighted forecast.',
            'The funnel shows how many leads reach each stage and where they drop off.',
            'Lost Reasons and Source Performance show why deals are lost and which sources (Website, Cold Call, Reference…) convert best.',
            'Choose This Month, This FY, Last FY or All Time; Admin / Manager can view any employee.',
        ],
    },
    {
        icon: 'globe',
        color: '#00838f',
        cat: 'sales',
        title: 'Website Leads',
        steps: [
            'Enquiries and catalogue downloads from the company website arrive automatically as leads — nobody has to type them.',
            'They show a 🌐 WEBSITE badge, and Lead Details shows which page they came from (e.g. "Contact page").',
            'Tap the 🌐 Website chip on the Leads screen to see only website leads.',
            'The assigned person gets a notification immediately and the lead appears in today\'s follow-ups.',
            'If the same mobile number enquires again, it is added to the existing lead instead of creating a new one.',
            'Admin: Leads → ⋮ → "Website Leads" to choose who receives all new website leads (default: Admin). Any single lead can still be reassigned from Lead Details.',
            'Connect your website (Admin, one time): Company Profile → 🌐 Website Leads → type your website address → Save website.',
            'Tap "Send setup to developer" and send it to whoever manages your website — it has your link and a ready-made form. Then fill your website form once yourself to test.',
        ],
    },
    {
        icon: 'document-text',
        color: '#6d4c41',
        cat: 'office',
        title: 'Quotations',
        steps: [
            'Create a quotation from inside a lead (Generate Quotation) so it stays linked to that lead.',
            'A lead with a new quotation moves to the Quotation stage automatically and its deal value is filled if empty.',
            'If a quotation was sent about a week ago and the lead has not been updated since, the salesperson gets a follow-up reminder in the morning.',
            'All quotations: Home → Sales → Quotations. Open any quotation to share it as a PDF.',
        ],
    },
    {
        icon: 'shield-checkmark',
        color: '#4caf50',
        cat: 'service',
        title: 'PMS Schedule (Preventive Maintenance)',
        steps: [
            'Home → Activity Report → "PMS Report".',
            'Add a PMS entry with client, machine, last service date, and next service date.',
            'The home screen badge shows PMS entries due THIS MONTH that are not yet marked Done.',
            'Every morning the engineer who did the last PMS of a machine gets a reminder when it is due or overdue.',
            'PMS Report PDF includes full company header and client details.',
        ],
    },
    {
        icon: 'journal',
        color: '#f9a825',
        cat: 'office',
        title: 'Personal Notes — Checklists & Reminders',
        steps: [
            'Sidebar → "Personal Notes". Only you can see your notes (bank details, points to remember, ideas).',
            'Tap + for a text note, or the small ☑ button above it for a checklist. In a note, the ☑ / 📄 icon at the top switches between text and checklist — lines become items and back.',
            'Tick items in the note or straight on its card; the card shows "2/5 done".',
            'Reminder: choose "Today 6 pm", "Tomorrow 9 am" or "Pick date & time". At that time you get a notification; tapping it opens the note. Tap ✕ to remove a reminder.',
            'To speak instead of typing, tap the mic on your phone keyboard (Hindi or English).',
            'Pin important notes, change the colour, share a note on WhatsApp, or archive old ones.',
        ],
    },
    {
        icon: 'cube',
        color: '#e67e22',
        cat: 'office',
        title: 'Courier Tracking',
        steps: [
            'Go to "Courier" under HR & Operations.',
            'Add sender, receiver, and courier partner details.',
            'Track the status until it is marked delivered.',
            'Tap the orange "Track" button: the courier company\'s tracking page opens (Blue Dart, Delhivery, DHL, FedEx, Xpressbees, Ecom, Ekart open with the number filled in; for DTDC, India Post and others the number is copied — just paste it). Then mark the entry Received / Delivered.',
            'Every morning Admin and Store get a summary of pending inward / outward couriers, and at 8 PM what was delivered and received today (Team & Settings → Alerts to change the time or switch off).',
            'Parcel for an employee (e.g. dispatched from office to a customer that a sales or service person handles): while logging the courier pick "Related Employees", or later tap "Share" on the entry in the Courier list (laptop: "+ Share" in the "By / For" column). Admin, Manager, Account, HR and Store can share.',
            'Shared employees get a notification at once, see the entry in their own Courier list marked "Shared with you", and can mark it Received / Delivered. While it is pending they also get a morning reminder ("Pending for you: 1 outward to follow up").',
            'To change or remove: tap "Edit" (or the names under "For") and tick / untick employees, then Share.',
        ],
    },
    {
        icon: 'chatbubbles',
        color: '#2e7d32',
        cat: 'admin',
        title: 'WhatsApp & Email Automation — How It Works',
        intro: 'Customers get WhatsApp and email updates for orders, payments, installations, services and couriers automatically, from your own WhatsApp number and email address.',
        steps: [
            'It is an add-on: one price for the whole company (not per employee), which covers our setup help. Ask us to activate it, or buy it in Plan & Renewal.',
            'You open your own accounts with a WhatsApp provider (Meta Cloud API, AiSensy or Wati) and an email service (Brevo, Resend or SendGrid). Their message charges are paid to them by you; the free plans of Brevo and Resend are enough for most companies.',
            'Settings: Sidebar → "WhatsApp & Email" → ⚙️ (top right). Admin only. Turn on WhatsApp and/or Email, choose the provider, paste the key(s), Save. The two guides below show where to get each key.',
            'Once saved, the keys show as one green "details saved" line (tap Change to edit them), and the WhatsApp / Email ON-OFF switches save at once — no need to type the keys again.',
            'Templates tab: the messages that are sent. Standard templates are ready to use; edit one to make your own copy.',
            'When an entry is saved the message goes out at once. If the provider is busy, it is tried again after 5 min, 30 min and 2 hours.',
            'Sent History tab: every message with its status; the reason is shown under any message that did not go. WhatsApp messages also show ✓ Sent, ✓✓ Delivered or blue ✓✓ Read once the status webhook is connected (see WhatsApp Setup).',
            'Pending Emails tab: emails that could not go out automatically (email not set up, or the provider refused them). Tap Send to send from your own email app.',
        ],
    },
    {
        icon: 'mail',
        color: '#1565c0',
        cat: 'admin',
        title: 'Email Setup — Get Your Key (Brevo / Resend / SendGrid)',
        intro: 'You need two things: an API key and a From address verified with that service. Gmail / Outlook passwords cannot be used.',
        steps: [
            'Choose a service. Brevo (brevo.com): free 300 emails a day — recommended. Resend (resend.com): free 100 a day / 3,000 a month. SendGrid: paid plans.',
            'Brevo — key: sign up, then click your name (top right) → "SMTP & API" → "API Keys" tab → "Generate a new API key" → give it a name → copy the key (it starts with xkeysib-).',
            'Brevo — From address: "Senders, Domains & Dedicated IPs" → Senders → "Add a sender" with your company email (e.g. orders@yourcompany.com) and confirm the email Brevo sends. Better: under Domains, authenticate your domain by adding the DNS records Brevo shows (in Hostinger / GoDaddy DNS) — then emails do not go to spam.',
            'Resend: "Domains" → "Add Domain" → add the DNS records it shows and wait for "Verified"; then "API Keys" → "Create API Key" (Sending access) → copy it (starts with re_). The From address must be on that domain.',
            'SendGrid: Settings → "Sender Authentication" → verify a single sender or your domain; then Settings → "API Keys" → "Create API Key" (Restricted, Mail Send: Full Access) → copy it (starts with SG.).',
            'In the app: WhatsApp & Email → ⚙️ → Email ON → pick the same service → paste the API key → enter the verified From address → Save.',
            'Tap "Send test" with your own email. If it arrives (check spam too), automatic emails are working. Customer replies go to the email in Company Profile.',
        ],
    },
    {
        icon: 'logo-whatsapp',
        color: '#25D366',
        cat: 'admin',
        title: 'WhatsApp Setup — Meta Cloud API / AiSensy / Wati',
        intro: 'WhatsApp business messages need the WhatsApp Business API (not the normal WhatsApp app) and templates approved by WhatsApp. Pick one provider.',
        steps: [
            'Template names: our standard templates have names like order_confirmed, payment_receipt, service_ticket_created. Create the same templates (same name, same wording) with your provider and get them approved. Each {customer_name}-style value fills one variable.',
            'Meta Cloud API (direct, no middleman): developers.facebook.com → My Apps → Create App → "Connect with customers through WhatsApp" → API Setup. Copy the "Phone Number ID" (after adding your business number). For a key that does not expire: business.facebook.com → Settings → System users → Add → Assign assets (your app + WhatsApp account) → "Generate token" with whatsapp_business_messaging and whatsapp_business_management → copy the Access Token.',
            'Meta — templates: WhatsApp Manager → Message templates → Create. Note the language you choose (e.g. English = en, English (US) = en_US) and pick the same language on the template in our Templates tab.',
            'AiSensy: Manage → "API Key" → Copy API Key. Then, for each template, Campaigns → Launch → "API Campaign", choose the approved template, name the campaign exactly like our template (e.g. order_confirmed) and set it Live.',
            'Wati: open "API Docs" in the top menu and copy the "API Endpoint URL" (https://live-mt-server.wati.io/…) and the Bearer / Access Token. In Wati templates use the same variable names as ours, e.g. {{customer_name}}.',
            'In the app: WhatsApp & Email → ⚙️ → WhatsApp ON → pick the provider → paste the token / key (and the Phone Number ID or API Endpoint URL) → Save.',
            'Test: create a test order for yourself with your own mobile number and check Sent History. Customer numbers must be correct 10-digit mobiles (or with +91).',
            'Optional — Delivered & Read ticks: in ⚙️, the "Delivered & Read status" card shows your Webhook URL. Copy it and paste it once in your provider: Meta → your app → WhatsApp → Configuration → Webhook (Callback URL + the Verify Token shown in the app), then subscribe to "messages"; Wati → Webhooks → Add Webhook (sent, delivered, read, failed events); AiSensy → Manage → Webhooks (ask AiSensy support if you do not see it). Keep the URL private.',
        ],
    },
    {
        icon: 'people-circle',
        color: '#3b5998',
        cat: 'admin',
        title: 'Team & Settings (Overview)',
        steps: [
            'Go to Sidebar → "Team & Settings" — only visible to Admins / Managers.',
            'Users Tab: Add, edit, or disable employee accounts. Tap "Select Multiple" to deactivate several employees at once.',
            'Permissions Tab: Control what each role or employee can see in the app.',
            'Holidays Tab: Manage the company holiday list (holidays are skipped by attendance alerts).',
            'Live Map Tab: See where your field team was on a selected day. Approx. km skips GPS points that jump impossibly far (the line above the map says how many were ignored).',
            'History Tab: See a log of who made sensitive changes (salary edits, deletions, permission changes) and when.',
            'Alerts Tab (Admin only): switch each daily alert on/off and choose its time.',
            'Setup Tab: all Excel uploads in one place — Company Profile, Employees, Products and Holidays. A new company can fill everything from here.',
            'Changes take effect immediately — employee may need to reopen the app.',
        ],
    },
    {
        icon: 'notifications',
        color: '#ff9800',
        cat: 'start',
        title: 'Notifications',
        steps: [
            'Notifications arrive on your phone even when the app is closed, and are also saved under the bell icon (top right).',
            'The red badge shows how many unread notifications you have. Tap "Mark All Read" to clear it.',
            'Tap any notification to open the related screen — the lead, service call, attendance, leave, etc.',
            'If you are not getting notifications: allow Notifications for the app in your phone Settings and keep the app updated.',
            'Notifications are sent automatically to the right people — e.g. a leave, advance or expense request goes to Admin / Account / HR, and the approval goes back to the employee. You do not get a notification for something you did yourself.',
        ],
    },
    {
        icon: 'alarm',
        color: '#d84315',
        cat: 'start',
        title: 'Daily Alerts & Reminders',
        steps: [
            '09:00 Today\'s follow-ups → each salesperson.',
            '09:05 PMS due → engineer who did the last PMS of that machine.',
            '09:10 Warranty ending (60 / 30 days) and machines with 3+ complaints in 90 days → Admin / Manager; AMC lead → the hospital\'s salesperson.',
            '09:15 Quotation follow-up (sent a week ago, no update) and lost-lead re-contact (3 / 6 months after "No Requirement Now" or "Budget Not Available") → salesperson.',
            '09:20 Low spare stock → Store / Admin.   09:30 Work anniversaries → whole team.',
            '10:00 Service calls open more than 2 days → Admin / Manager, and each engineer for their own calls.',
            '11:00 Day In pending → HR / Admin (Sundays, holidays and approved leave are skipped).   11:30 Approvals pending more than 2 days → HR / Admin.',
            'Day In reminder → the employee, 15 min after their shift starts if Day In is not done. Day Out reminder → the employee, 30 min after their shift ends if Day Out is not done. Once a day each; skipped on weekly off, holidays and approved leave. Staff without a shift get them at the time set for these two alerts.',
            '20:00 Team\'s day report (visits, new leads, quotations, orders) → Admin / Manager.',
            'Admin can switch any alert off or change its time in Team & Settings → Alerts. Each alert is sent only once a day.',
        ],
    },
    {
        icon: 'person-circle',
        color: '#607d8b',
        cat: 'start',
        title: 'My Profile',
        steps: [
            'Tap your avatar/initials (top right of home screen) to open your profile.',
            'You can update your profile photo, name, and contact details here.',
            'Your Employee ID and role are shown in the sidebar.',
            'Forgot your password? Ask your Admin to set a new one from Team & Settings → Users.',
        ],
    },
    {
        icon: 'card',
        color: '#1565c0',
        cat: 'admin',
        notIos: true,
        title: 'Plan & Renewal',
        steps: [
            'Sidebar → "Plan & Renewal" (Admin). The card at the top shows your current plan, valid-till date, days left and employees used.',
            'Select a plan (prices are per employee per year, + GST), enter the number of employees, and optionally add the Automation add-on (one price per company). The Order Summary shows the subtotal, GST and total payable.',
            'Tap "Pay Online" (Card / UPI / Net Banking / Wallet). Or tap "Pay by UPI QR instead", scan the QR, pay, then type the 12-digit UPI Ref No. (UTR) from your UPI app and tap "I Have Paid".',
            'Pay Online: your plan is active as soon as the payment goes through — no waiting. UPI QR ("I Have Paid"): the plan activates once our team matches your UPI Ref No. with the bank (usually within 1 hour). Tap "I Have Paid" only after paying — one request at a time.',
            'When 30 days or less are left, a "Plan: N days left" badge shows on the Home screen and under your name in the sidebar. Tap it to go straight to renewal.',
            'If the plan / trial ends, the app becomes view only: everyone can still log in and see old data, but nothing new can be added, edited or deleted. A red "Plan expired — view only" bar shows at the bottom; Admin can tap it to renew. Everything works again as soon as the plan is renewed.',
        ],
    },

    {
        icon: 'cash',
        color: '#1565c0',
        cat: 'payroll',
        title: 'Payroll — Generate, Lock, Bank Sheet & Paid',
        steps: [
            'Home → HR & Operations → "Payroll". Admin / Manager / HR / Accounts see the Generate and Salary Rules tabs; employees see only their own payslips.',
            'Set the rules once in the "Salary Rules" tab (each section has its own colour): Incentive, Late-Coming, Short Hours, Weekly Off & Shift, Overtime, Absent & One Day’s Salary, Leave Quota / Leave Policy. Tap "Save Rules".',
            'Generate tab: pick Month & Year → select an employee → "Calculate Preview" shows the full breakdown (late, absent, overtime, incentive, advance…). "Generate Payslip" saves it.',
            'Found a mistake (attendance or leave corrected)? Open the payslip → "↻ Recalculate this payslip". Any advance it recovered is put back and recovered again.',
            'When every payslip is checked: Status card → "🔒 Finalize & Lock". The month is locked — no new or recalculated payslips. An Admin can "Reopen" it before it is paid.',
            'After locking: "🏦 Bank Transfer Sheet (Excel)" gives Beneficiary, Account No (as text), IFSC and Amount for NEFT. Employees with missing bank details are listed first.',
            'After transferring salaries: "💰 Mark Salary as Paid" → choose the date. Every employee gets a "Salary Credited" notification and the payslip shows "Paid on dd/mm/yyyy". This can’t be undone.',
            'Employees: Payroll → "My Payslips" → tap a month → "📄 Download PDF". A payslip appears only after it is generated.',
        ],
    },
    {
        icon: 'calendar',
        color: '#2196f3',
        cat: 'leaves',
        title: 'Leave Application & Balance',
        steps: [
            'Go to "Leaves" and tap Apply. Choose the leave type and dates — total days are calculated automatically.',
            'For a one-day leave, tick "Half day (0.5)" (if your company allows it). The half day is taken from the type you chose (e.g. Casual Leave → 0.5 CL).',
            'If the company counts only working days, weekly offs and holidays inside the leave are not counted (Fri–Mon = 2 days).',
            'The card on top shows your balance. With the Leave Policy on you see separate CL / SL / EL / Comp Off balances; working on a weekly off or holiday adds Comp Off.',
            'If you apply for more than your balance, the app warns you — the extra days may be treated as Leave Without Pay.',
            'Your manager / HR approves or rejects it. Requests pending more than 2 days are reminded to HR / Admin every morning.',
        ],
    },
    {
        icon: 'cloud-upload',
        color: '#00897b',
        cat: 'admin',
        title: 'Excel Import — Company, Employees, Products, Holidays',
        steps: [
            'Open Team & Settings → Setup. All four Excel uploads are there (Products, Employees and Holidays also keep their own buttons in Product Master and Team & Settings).',
            'Company Profile: tap "Download Company Sheet" — it lists every detail (name, address, GST, contact, UPI, both bank accounts) with what is saved now. Fill the "Value" column and upload; you see each change before saving. Empty cells keep the old value. Logo, signature and QR code are added in Company Profile.',
            'Employees: the template has every HR column — role, joining date, targets, salary, yearly leaves, personal contact, blood group, address, bank, IFSC, Aadhaar, PAN. Only Name and Email are required. Role: Admin, Manager, Account, HR, Store, Sales or Service.',
            'To fill missing details for people already in the app: tap "Download Current Employees", fill the blanks, upload it, and turn on "Fill details for existing employees". Only filled cells are saved — name, role, email and password never change from Excel.',
            'Dates can be typed as 2026-01-15 or 15/01/2026, or be normal Excel dates. Amounts can include ₹ and commas.',
            'Review the preview screen before confirming — it shows which rows are new, which already exist and which have a problem.',
            'New employees created this way get the same default starting password, shown on screen after import.',
        ],
    },
    {
        icon: 'location',
        color: '#c62828',
        cat: 'attendance',
        title: 'Office / Field Attendance Tagging',
        steps: [
            'Admin: go to Company Profile and tap "Set Office Location" while standing at your office — this is a one-time setup.',
            'After that, every Day In is automatically tagged "Office" (green) or "Field" (orange) based on distance from that location.',
            'The tag appears next to each attendance entry and is included when exporting Attendance to Excel.',
        ],
    },
    {
        icon: 'chatbubbles',
        color: '#5e35b1',
        cat: 'admin',
        title: 'WhatsApp & Email (Templates & Broadcast)',
        steps: [
            'Go to Sidebar → "WhatsApp & Email". The ⚙️ icon at the top opens the automation settings.',
            'Templates Tab: create and manage reusable WhatsApp/Email message templates. For WhatsApp, the name and language must match the template approved on Meta. Use the All / WhatsApp / Email buttons to see one kind only.',
            'Each template has a Sending ON / OFF switch (Admin). OFF = that automatic message is not sent to customers (e.g. switch off sales_visit_thanks). One name can have only one WhatsApp and one Email template; "Use standard" removes your own copy and brings the standard text back.',
            'Pending Emails Tab: emails that could not go out automatically (email not set up, or the provider refused them) — tap Send to send from your own email app.',
            'History Tab: view previously sent messages and their delivery status. If WhatsApp was busy or the internet failed, the message stays Pending and is tried again automatically (after 5 min, 30 min and 2 h).',
            'Broadcast Tab: send a message to a group of contacts at once. WhatsApp: pick one of your approved templates (e.g. a product offer) — each customer\'s name is filled in. Email: type the subject and message.',
            'New WhatsApp offer: create and get it approved on Meta first (Marketing, no image in the header), then Templates → + → WhatsApp → the same name and text (with {customer_name} for {{1}}). It then appears in Broadcast. Test on your own number before sending to customers.',
        ],
    },
    {
        icon: 'time',
        color: '#00897b',
        cat: 'attendance',
        title: 'Weekly Off & Shift',
        steps: [
            'Company default: Payroll → Salary Rules → "Weekly Off & Shift". Choose the weekly off days (e.g. Sun, or Sat + Sun), extra Saturdays off (e.g. 2nd & 4th), shift start / end (24-hour, e.g. 09:30 – 18:30) and "Late after (min)" grace.',
            'For one employee: Team & Settings → edit the employee → "Weekly off & shift" → "Own schedule". Choose "Company default" to go back.',
            'This schedule is used everywhere: Day In list ("Monday Off", "2nd Saturday Off"), Attendance Report, leave balance, the 11 AM Day-In alert, phone reminders (they follow the shift time) and late marks in payroll.',
            'A normal company (e.g. 10:00 – 18:00, Sunday off) needs nothing else. For different shifts, night shifts or a changing duty plan, use the Shift Roster (see "Shift Roster — Shifts, Night Shift & Monthly Plan").',
        ],
    },
    {
        icon: 'calendar-number',
        color: '#303f9f',
        cat: 'attendance',
        title: 'Shift Roster — Shifts, Night Shift & Monthly Plan',
        steps: [
            'Open: Sidebar → "Shift Roster", or the calendar button at the top of the Attendance screen. Admin, HR and Manager see everyone; other staff see "My Shifts" (their own next 2 weeks).',
            'Step 1 — Shifts tab → "Add": name, start, end and "Late after (min)", e.g. General 09:00 – 18:00, Night 22:00 – 06:00. An end time before the start = night shift that ends next day (🌙). A shift can be at most 12 hours.',
            'Step 2 (optional) — Default shift: Team & Settings → edit the employee → "Default shift". It applies on every day that has no roster entry.',
            'Step 3 — Roster tab: tap any employee\'s day and choose a shift, "Off", or "Clear (use default)". Tick "Also till …" to fill the rest of the week / month.',
            '"Assign dates": pick several employees and a From – To range (up to 62 days) and set them all at once — e.g. "5 to 11 Oct → Night".',
            'Week / Month: switch at the top. Laptop opens the month view; phone opens the week view. Use the arrows to move; tap the date title to come back to today.',
            'Off in the roster replaces the weekly off for that date; a shift on a weekly off day makes it a working day. Company holidays (Holidays list) show automatically for everyone.',
            'Each employee gets a notification when their roster changes. Late marks, absent days, overtime and reminders follow each day\'s shift.',
            'Download: the green Excel button saves the roster on screen (week or month). For any month or the whole year: Activity Timeline → Export → "Shift Roster".',
        ],
    },
    {
        icon: 'alarm',
        color: '#ef6c00',
        cat: 'payroll',
        title: 'Salary Rules — Late, Absent & Overtime',
        steps: [
            'Late-Coming: turn it on, then choose how to cut — "½ day per late", "½ day per 3 lates" or "₹ per late" — and how many lates per month are free. Late = Day In after shift start + grace (or after the "late after" time).',
            'A late mark cuts salary only — it never reduces any leave balance.',
            'Absent & One Day’s Salary: choose one day’s salary = salary ÷ days in month, ÷ 30 or ÷ working days. Turn on "Cut one day’s salary for absent" to deduct days with no Day In and no approved leave. Optional: sandwich rule, and "Day In without Day Out = ½ day absent".',
            'Overtime: turn on "Pay overtime", choose the rate (hourly salary × 1 / 1.5 / 2, or fixed ₹ per hour), the minimum minutes, rounding and the maximum hours per day. Only working days count — work on a weekly off earns leave instead.',
            'Always check with "Calculate Preview" before generating payslips. Rules apply to payslips generated after you save them.',
        ],
    },
    {
        icon: 'briefcase',
        color: '#8e24aa',
        cat: 'leaves',
        title: 'Leave Policy — CL / SL / EL & Carry Forward',
        steps: [
            'Payroll → Salary Rules → "Leave Policy (CL / SL / EL)" → turn on "Separate CL / SL / EL balances". Set the yearly days for each, and whether it carries forward (with a maximum).',
            'Choose what Marriage / Festival / Others leave does (from CL, paid without balance, or unpaid), whether weekly offs inside a leave count, and whether half-day leave is allowed.',
            'HR: Leaves → purple 💼 button → "Leave Balances" shows every employee’s CL / SL / EL / Comp Off / LWP for the year. Tap an employee to enter opening balances (e.g. carried over from before the app).',
            'At the end of the year (after 31 March): "↪ Carry forward" shows a preview of what moves to the next year, then saves it. Balances typed in by hand are not overwritten.',
            'With the policy off, everything works as before (one yearly leave pool per employee).',
        ],
    },
    {
        icon: 'analytics',
        color: '#6a1b9a',
        cat: 'admin',
        module: 'hr',
        title: 'Employee 360',
        steps: [
            'Team & Settings → Users → tap "📊 360" on an employee card (or Sidebar → Activity Timeline → choose an employee → "📊 360").',
            'One screen shows: profile and years of service, attendance, this month’s salary estimate (late, absent, overtime, advance), leave balances and recent leaves, advances and expenses, recent payslips, and work (sales, collection, visits, leads, service calls, tasks).',
            'Use the chips This month / This FY / Last FY / All time to change the period for attendance, work and expenses.',
        ],
    },
    {
        icon: 'exit',
        color: '#c62828',
        cat: 'payroll',
        title: 'Full & Final Settlement (employee leaving)',
        steps: [
            'Employee 360 → "Full & Final settlement" (Admin / HR).',
            'Choose the last working day; optionally the leave days to encash (blank = balance), notice-period shortfall, gratuity (on automatically after 5 years), and any other addition or deduction. Tap "Calculate".',
            'Check the lines: salary up to the last day, leave encashment, gratuity, additions, minus advance balance, notice shortfall and deductions → Net payable.',
            '"Save Full & Final" closes the employee’s advances. Then "📄 Share PDF" and, after paying, "💰 Mark as Paid". Until it is paid, "Delete settlement" undoes it and reopens the advances.',
            'Disable the employee in Team & Settings after they leave. The calculation follows your own rules — check it before paying.',
        ],
    },
    {
        icon: 'navigate',
        color: '#0277bd',
        cat: 'sales',
        title: 'Nearby Leads',
        steps: [
            'Leads → 🧭 button. "Near me" shows open leads within 5 / 10 / 25 / 50 / 100 km, nearest first. "By city" shows open leads of one city.',
            'Switch between List and Map. Each lead has Call and Directions (Google Maps).',
            'A lead has a location when it was created from a visit with GPS, or when a visit with GPS is logged for it. Leads without a location appear only under "By city".',
        ],
    },
    {
        icon: 'trophy',
        color: '#ff9800',
        cat: 'sales',
        title: 'Visit Targets',
        steps: [
            'Set targets: Team & Settings → edit the employee → "Visits / day" and "Visits / month" (blank = no target).',
            'See progress: Visits DSR → orange 🏆 button, or Team Performance → "Visits". Today x / target, this month y / target with an "expected by today" mark, and "On track" / "Behind pace".',
            'Salespeople see only their own card.',
        ],
    },
    {
        icon: 'camera',
        color: '#5d4037',
        cat: 'start',
        title: 'Photos — PO, Service, Expense Bill, Installation, Cheque',
        steps: [
            'Photos are compressed on the phone (about 60–120 KB) and uploaded when you save: Order PO (photo), Service Call photo, Expense bill photo, Installation photo (one photo for all machines of the report) and Payment cheque photo (when mode is Cheque).',
            'Open the saved record to view the photo full size, Replace it or Delete it (deleting also removes the file from storage).',
            'If an upload fails, the record is still saved — open it and add the photo again.',
        ],
    },
    {
        icon: 'receipt',
        color: '#f44336',
        cat: 'expenses',
        title: 'Expenses — Claims, Day Out & Purchase Approval',
        steps: [
            'Expenses has four tabs: All (claims + Day Out expenses), Claims, Day Out and Requests. The boxes on top show Outstanding (claims still to be paid), Day Out total and Total Spent.',
            'Day Out expenses (DA / Hotel / Misc entered at Day Out) appear automatically with a purple DAY OUT tag. They are paid with salary, so nobody needs to approve them here.',
            'Already spent money on something else? Tap "Add Claim", add the bill photo and submit — Admin / Accounts approve it and later "Clear Due" pays it.',
            'Before an important purchase, tap the orange 🛒 button: enter the estimated amount and why it is needed (a quotation photo is optional). Admin, Manager and Accounts get a notification.',
            'After approval, buy it, open the request and tap "Add Bill / Claim". If the bill is within the approved amount the claim is approved straight away; if it is more, it waits for approval again.',
            'Admin / Manager / Accounts can set a pre-approval limit with the ⚙️ button. Claims above it show a warning suggesting "Ask Approval" first.',
        ],
    },
    {
        icon: 'stats-chart',
        color: '#1565c0',
        cat: 'attendance',
        title: 'Attendance & Leave — Tap a Box to Filter',
        steps: [
            'Attendance Report: tap Present, Absent, Leave, Short, Expense or Holiday — the list below shows only those days. Tap again (or ✕) to see everything.',
            'Leave screen: tap Leave, Absent, Short or the earned (+) count — or CL / SL / EL / Comp Off / LWP when the Leave Policy is on — to see only those rows for the financial year.',
        ],
    },
    {
        icon: 'git-branch',
        color: '#455a64',
        cat: 'sales',
        title: 'Leads Board — Days in Stage',
        steps: [
            'Each card on the Leads Board shows how long the lead has been in its current stage, e.g. "⏳ Quotation for 25 days". It turns red after 30 days.',
            'Moving a lead to another stage restarts the count ("since today").',
        ],
    },
];

// =========================================================
// 📋 FAQ DATA
// =========================================================
const FAQS: FaqItem[] = [
    {
        cat: 'start',
        q: 'I am new. How do I start?',
        a: `Open Help → "Start Here — First Setup, Step by Step". In short: 1. Company Profile and office location. 2. Weekly off & shift (Payroll → Salary Rules). 3. Holidays. 4. Add employees (Team & Settings → Users, or Excel in Team & Settings → Setup). 5. Permissions for each role. 6. Alerts. 7. Products and customers. 8. Everyone logs in and allows Notifications and Location.`,
    },
    {
        cat: 'start',
        q: 'Can I use the app on a laptop or computer?',
        a: `Yes. Open https://app.lifelinem.com in Chrome or Edge and log in with your usual email and password. Maps, push notifications and Day In location tracking work only in the phone app.`,
    },
    {
        cat: 'orders',
        q: 'Where does the advance taken at order booking show?',
        a: `It is saved as a payment linked to the order, with its own receipt number. You see it in Collect Payment and inside the order's Pending Due (Payments for this entry). The order balance already has the advance taken off.`,
    },
    {
        cat: 'start',
        q: 'I created something but did not get a notification',
        a: `That is expected — notifications go to the people who need to act (for example Admin / Account for an advance request), not to the person who created it. Ask a colleague with that role to check their notifications.`,
    },
    {
        cat: 'attendance',
        q: 'Problem with Day In — attendance is not marking',
        a: `First read the message the app shows — it says why:\n• "Could not reach the server" / "took too long" → internet problem (see below).\n• "Your login has expired" → log out and log in again.\n• "Plan has expired" → ask your Admin to renew; old data stays visible.\n• "Location needed" → turn on GPS (see the location FAQ).\n\nFor an internet problem, follow these steps in order:\n\n1. Make sure your internet is ON (mobile data or Wi-Fi).\n2. Fully close the app and reopen it (don't just minimise).\n3. Wait 5–10 seconds after the app loads, then try Day In again.\n4. Make sure Location / GPS is turned ON — attendance requires your location.\n5. If it still fails, go to Settings → Apps → [App Name] → Clear Cache, then restart the app.`,
    },
    {
        cat: 'attendance',
        q: 'Problem with Day Out — button not responding or showing error',
        a: `Read the message the app shows (internet, login expired or plan expired — same as Day In). If nothing happens, close and reopen the Attendance screen: the app loads today's entry again and Day Out works.\n\nFor an internet problem:\n\n1. Check internet — if you are in a low-coverage area, move to a spot with better signal.\n2. Turn on GPS/Location if it is off (Settings → Location → Turn On).\n3. Close the app completely and restart it.\n4. Try Day Out again.\n\nTip: If you are in a basement or underground area, step outside briefly to get a GPS fix, then mark Day Out.`,
    },
    {
        cat: 'attendance',
        q: 'GPS / Location not working for attendance',
        a: `1. Go to Settings → Location → make sure it is ON.\n2. Set Location Mode to "High Accuracy".\n3. For the app: Settings → Apps → [App Name] → Permissions → Location → Allow.\n4. Restart the app and try again.\n\nIf accuracy is poor, stand near a window or step outside.`,
    },
    {
        cat: 'attendance',
        q: 'Why does "LMS — on duty" stay in my notifications after Day In?',
        a: `After Day In, LMS records your location every 30 minutes until Day Out, so your manager can see field visits on the Live Map — even if you minimise the app.\n\n• The notification shows that this is on. It cannot be swiped away while you are on duty.\n• It stops automatically when you mark Day Out or log out, and also at the end of the day.\n• Location is not recorded outside Day In → Day Out.\n• If your phone restarts, open the app once and tracking continues.`,
    },
    {
        cat: 'attendance',
        q: 'What do the location messages mean?',
        a: `• "Location permission is off" → Settings → Apps → LMS → Permissions → Location → Allow.\n• "Phone location (GPS) is off" → turn on Location from the quick settings.\n• "Could not get your location" → turn on "Google Location Accuracy" (Settings → Location), step near a window or outside, and try again.\n\nDay In needs a location. Day Out always saves — the location is added when the phone can get it.`,
    },
    {
        cat: 'attendance',
        q: 'I forgot to mark Day In / Day Out — what should I do?',
        a: `If you missed marking attendance:\n\n1. Contact your Admin or HR immediately and inform them.\n2. The Admin can manually update or note your attendance from the Team & Settings panel.\n3. Do not try to mark it later on your own — the system records the actual time of marking.\n\nNote: Always mark Day In as soon as you start work to avoid discrepancies.`,
    },
    {
        cat: 'attendance',
        q: 'My attendance is showing "Not Marked" on the home screen even after marking',
        a: `1. Pull down on the home screen to refresh the data.\n2. Close the app fully and reopen it.\n3. Check if your internet was ON when you marked attendance — if it was off, the entry may not have saved.\n4. Go to the Attendance screen and check if today's entry appears in the list.\n\nIf the entry is missing, contact your Admin to manually record it.`,
    },
    {
        cat: 'attendance',
        q: 'How do I set up a night shift (e.g. 22:00 to 06:00)?',
        a: `1. Sidebar → Shift Roster → Shifts tab → Add → Name "Night", Start 22:00, End 06:00 → Save. (End before start = ends next day, shown with 🌙.)\n2. Roster tab → tap the employee's day → choose Night. Use "Assign dates" for many days or many employees.\n\nThe employee does Day In at night and Day Out next morning on the same entry. Late marks, reminders and payroll follow the night shift.`,
    },
    {
        cat: 'attendance',
        q: 'Do we have to fill the Shift Roster for everyone, every month?',
        a: `No. If your company works one fixed time (e.g. 10:00 – 18:00, Sunday off), set it once in Payroll → Salary Rules → "Weekly Off & Shift" — that applies to everyone, every year.\n\nUse the roster only for exceptions: night shifts, rotating duty, or someone's special day off. Days without a roster entry use the employee's default shift / weekly off.`,
    },
    {
        cat: 'attendance',
        q: 'Who can see and change the Shift Roster?',
        a: `• Admin, HR and Manager: see everyone and can change any day.\n• Other staff: see only their own shifts ("My Shifts", next 2 weeks) and cannot change them.\n\nWhen a day is changed, the employee gets a notification.`,
    },
    {
        cat: 'attendance',
        q: 'How do I download the roster in Excel?',
        a: `• Shift Roster → the green Excel button: downloads the week or month on screen.\n• Activity Timeline → Export → turn on "Shift Roster" → choose the month (or the whole year) → Generate Excel.\n\nThe file has two sheets: "Roster" (employees × dates, like the screen) and "Roster List" (one row per employee per day — easy to filter).`,
    },
    {
        cat: 'attendance',
        q: 'Why does my attendance say "Auto closed"?',
        a: `Day Out was not marked, so the system closed the entry a few hours after the shift ended, with Day Out = shift end time (or 11:59 PM if no shift is set).\n\nAlways mark Day Out yourself. If the time is wrong, inform your Admin / HR.`,
    },
    {
        cat: 'start',
        q: 'The app says "Session expired — please log in again"',
        a: `Your login is renewed automatically every time you open the app, so this only happens if the app was not opened for about a month, or your password / account was changed.\n\nJust log in again with your email and password.`,
    },
    {
        cat: 'start',
        q: 'App is not loading or showing a blank screen',
        a: `1. Check if your internet is working — try opening a website in your browser.\n2. If internet is off, turn it on and wait 10 seconds.\n3. Close the app fully and reopen it.\n4. If still blank: Settings → Apps → [App Name] → Clear Cache, then restart.\n5. If nothing works, uninstall and reinstall the app.`,
    },
    {
        cat: 'start',
        q: 'Data is not syncing — I saved something but it is not showing',
        a: `This is almost always an internet issue.\n\n1. Check your connection — switch from mobile data to Wi-Fi (or vice versa).\n2. Pull down on the list screen to refresh.\n3. Close the app and reopen it.\n4. In a low-signal area, data will auto-sync once connectivity is restored — no data is lost.`,
    },
    {
        cat: 'start',
        q: 'The app works on Wi-Fi but not on mobile data',
        a: `1. Check if mobile data is enabled for this app: Settings → Apps → [App Name] → Data Usage → enable "Mobile Data".\n2. Some phones restrict background data — disable "Data Saver" mode temporarily.\n3. Check if your mobile data plan is active and has balance.\n4. Try turning mobile data off and on again.\n5. Restart the app after making these changes.`,
    },
    {
        cat: 'admin',
        q: 'How do I update company details — name, address, contact?',
        a: `1. Go to Sidebar → "Company Profile".\n2. Update your Company Name, Address, Phone, Email, GST Number, and Website.\n3. Tap Save — these details reflect immediately on all new PDFs generated (Payment Receipt, Delivery Challan, Order, Installation, PMS, Service, Demo Reports).\n\nNote: Already generated PDFs will not change — only new ones will use the updated details.`,
    },
    {
        cat: 'admin',
        q: 'Company logo is not appearing on PDFs',
        a: `1. Go to Sidebar → Company Profile.\n2. Tap the Logo field and upload your company logo (PNG or JPG recommended, square size preferred).\n3. Tap Save.\n4. Generate a new PDF — the logo should now appear at the top.\n\nIf the logo still does not show: make sure the image is under 1 MB and in JPG or PNG format.`,
    },
    {
        cat: 'admin',
        q: 'PDF is showing wrong address or blank address',
        a: `1. Go to Sidebar → Company Profile.\n2. Check the Address field — make sure it is filled completely (Street, City, State, Pincode).\n3. Tap Save.\n4. Generate a new PDF — address will now appear correctly.\n\nTip: Fill the address in one complete line for best results on PDFs.`,
    },
    {
        cat: 'admin',
        q: 'Bank details are not showing on Payment Receipt',
        a: `1. Go to Sidebar → Company Profile → scroll down to Bank Details.\n2. Fill in Bank Name, Account Number, IFSC Code, and Branch for Bank 1 (and Bank 2 if applicable).\n3. Tap Save.\n4. Generate a new Payment Receipt — bank details will now appear at the bottom.\n\nNote: Leave Bank 2 blank if you only have one account.`,
    },
    {
        cat: 'admin',
        q: 'UPI QR Code is not showing in the app',
        a: `1. Go to Sidebar → Company Profile.\n2. Upload your UPI QR Code image in the "QR Code" field.\n3. Also enter your UPI ID in the UPI ID field.\n4. Tap Save.\n5. Open the Collect Payment screen — your QR code will now appear at the top.\n\nTo share the QR code: tap the Share button next to it to send via WhatsApp or any other app.`,
    },
    {
        cat: 'admin',
        q: 'Signature is not appearing on PDFs',
        a: `1. Go to Sidebar → Company Profile.\n2. Upload your signature image in the "Signature" field (white background recommended).\n3. Tap Save.\n4. Generate a new PDF — the signature will appear at the bottom as the authorized signatory.\n\nTip: Use a clear signature on a white background for best print quality.`,
    },
    {
        cat: 'reports',
        q: 'How do I generate and share a PDF (Receipt, Challan, Report)?',
        a: `1. Open the relevant record — Order, Payment, Installation, Service, PMS, or Demo.\n2. Tap the PDF or Share icon (top right of the detail screen).\n3. The PDF is generated automatically with your company details, logo, and data.\n4. A share sheet opens — choose WhatsApp, Email, or any other app to send it.\n5. You can also download it to your phone storage from the share options.`,
    },
    {
        cat: 'orders',
        q: 'How do I generate a Payment Receipt for a client?',
        a: `1. Home → Sales → "Collect Payment".\n2. Find the payment entry for which you need the receipt.\n3. Tap on it to open the details.\n4. Tap the PDF/Share icon — a Payment Receipt is generated with your company header, client details, amount, payment mode, and bank details.\n5. Share it directly with the client via WhatsApp or Email.`,
    },
    {
        cat: 'orders',
        q: 'How do I generate a Delivery Challan / Order PDF?',
        a: `1. Home → Sales → "Order Booking".\n2. Find the order entry.\n3. Tap on it to open the details.\n4. Tap the PDF/Share icon — a Delivery Challan is generated with your company logo, client details, products, and amounts.\n5. Share with the client or print it directly.`,
    },
    {
        cat: 'reports',
        q: 'PDF is showing blank or missing data fields',
        a: `Blank fields in PDFs happen when the original record was saved without filling all details, OR when Company Profile is incomplete.\n\n1. First check Company Profile — make sure Name, Address, Phone, and Bank Details are filled.\n2. Open the specific record and check if all fields are filled.\n3. Edit the record and fill missing details, then regenerate the PDF.`,
    },
    {
        cat: 'orders',
        q: 'Can I attach the PO as a PDF?',
        a: `No — to save storage, the PO is attached as a photo. Take a photo of the printed PO, or take a screenshot of the PDF on your phone and pick it from the gallery. The photo is made small automatically (about 60–120 KB) and stays clear enough to read. POs attached earlier as PDF still open as before.`,
    },
    {
        cat: 'orders',
        q: 'I submitted an order but it is not showing in the list',
        a: `1. Check your internet connection — the order may not have saved if you were offline.\n2. Pull down on the Orders screen to refresh.\n3. Close the app and reopen it.\n4. If the order still does not appear, do NOT submit it again — contact your Admin first to avoid duplicates.`,
    },
    {
        cat: 'orders',
        q: 'Payment was collected but the due amount did not reduce',
        a: `1. Make sure the client name in the payment matches exactly with the client name in the due record.\n2. Check if the payment was saved successfully (it should appear in the Payment Collections list).\n3. If names are slightly different (e.g. "City Hospital" vs "City Hosp."), the system cannot match them — ask your Admin to manually adjust.\n4. Pull down to refresh the dues list after a few seconds.`,
    },
    {
        cat: 'orders',
        q: 'How do I check my payment collection history?',
        a: `1. Home → Sales → "Collect Payment".\n2. The list shows all payments recorded.\n3. Admins and Accountants can see all payments across the team.\n4. Filter by date or client name to find specific records.`,
    },
    {
        cat: 'admin',
        q: 'WhatsApp / Email message was not sent to the customer',
        a: `1. Go to Sidebar → WhatsApp & Email → ⚙️ and check that WhatsApp / Email is turned ON.\n2. Verify the API key is entered correctly and saved.\n3. Make sure the customer's mobile number is correct (10 digits).\n4. Check the History tab in WhatsApp & Email for the delivery status and the reason shown under it.\n5. "Pending — will try again automatically" means WhatsApp was busy; it is retried by itself.\n6. "Template name does not exist in the translation" means the template name or language does not match Meta — open the template and pick the language it was approved in.\n7. If still failing, contact support.`,
    },
    {
        cat: 'admin',
        q: '"Send test" email failed — what do I check?',
        a: `1. The service in the app (Brevo / Resend / SendGrid) must be the one the key came from.\n2. Paste the key again — no spaces; a Brevo key starts with xkeysib-, Resend with re_, SendGrid with SG.\n3. The From address must be verified in that service (Brevo: Senders; Resend: a verified domain; SendGrid: Sender Authentication).\n4. Save first, then tap Send test.\n5. If it says "sent" but nothing arrived, check the spam folder and authenticate your domain (DNS records) in the email service.`,
    },
    {
        cat: 'admin',
        q: 'WhatsApp error: "Campaign not live" / template not found / invalid template',
        a: `AiSensy: create an API Campaign for that template, named exactly like our template (e.g. order_confirmed), and set it Live.\nWati: the template must be approved and use the same name and variable names, e.g. {{customer_name}}.\nMeta: the template must be approved in WhatsApp Manager with the same name; pick the same language on the template in our Templates tab.\nThe template name to use is shown in Sidebar → WhatsApp & Email → Templates.`,
    },
    {
        cat: 'admin',
        q: 'How do I know if the customer received or read our WhatsApp?',
        a: `Sidebar → WhatsApp & Email → Sent History. Under each WhatsApp message:\n✓ Sent — accepted by your provider\n✓✓ Delivered — reached the customer's phone (with time)\nblue ✓✓ Read — the customer opened it\n\nThis needs the status webhook connected once (Admin): ⚙️ → "Delivered & Read status" card → copy the Webhook URL → paste it in your WhatsApp provider (steps are in the card and in Help → WhatsApp Setup). Only messages sent after connecting get ticks.\n\nIf the provider reports the message could not reach the phone (wrong number, not on WhatsApp), it moves to Failed with the reason.`,
    },
    {
        cat: 'admin',
        q: 'How do I add our Facebook / Instagram / IndiaMART links to customer emails?',
        a: `Admin: Sidebar → Company Profile → scroll to the bottom → 🌐 Social Media & Online Stores. Paste your page links (https:// is added automatically) → Save Global Settings.\n\nEmails like Order Confirmation then show them as buttons; a link you leave empty is hidden. In your own templates use {company_fb}, {company_insta}, {company_youtube}, {company_linkedin}, {company_telegram}, {company_indiamart}, {company_tradeindia} or {company_exporter}.`,
    },
    {
        cat: 'admin',
        q: 'Customer is receiving duplicate WhatsApp messages',
        a: `1. Check the Orders or Payment list for duplicate entries — duplicate messages happen when the same entry is saved more than once.\n2. If duplicates exist, ask your Admin to delete the extra entry.\n3. Make sure the Submit button is not being tapped multiple times.`,
    },
    {
        cat: 'admin',
        q: 'I do not want to send WhatsApp messages for a specific entry',
        a: `1. Make sure the client's mobile number field is left blank — messages are only sent if a number is present.\n2. Alternatively, ask your Admin to temporarily turn off automation from WhatsApp & Email → ⚙️, add the entry, then turn it back on.`,
    },
    {
        cat: 'start',
        q: 'How do I delete my account?',
        a: `Open My Profile (tap your name / photo) → scroll down → "Delete my account" → confirm.\n\n• Employee: your login is closed at once and your personal details are removed within 30 days. Work records you created (attendance, leads, orders…) stay with your company. Your Admin is informed.\n• Admin: deleting the admin account deletes the whole company's data, so it is sent as a request — our team contacts you to confirm and completes it within 30 days.\n\nYou can also request deletion at lifelinem.com/account-deletion.html.`,
    },
    {
        cat: 'start',
        q: 'The app says "Update required" or "New version available"',
        a: `We release new versions with new features and fixes.\n\n• "New version available": tap "Update now" to open the store and update, or "Later" to keep working.\n• "Update required": this version is too old to keep working with the server. Tap the update button, update LMS CRM from the Play Store / App Store, then open the app again. Your data is safe — it is stored on our server, not on the phone.\n\nIf the store still shows "Open" instead of "Update", wait a few minutes and check again.`,
    },
    {
        cat: 'admin',
        notIos: true,
        q: 'My plan is expiring soon — how do I renew?',
        a: `1. Admin: Sidebar → "Plan & Renewal" (or tap the "Plan: N days left" badge on Home).\n2. Choose the plan and number of employees, then tap "Pay Online" — or tap "Pay by UPI QR instead", pay, enter the 12-digit UPI Ref No. and tap "I Have Paid".\n3. Pay Online: the plan is active immediately. UPI QR: it is activated after we match the UPI Ref No. with our bank (usually within 1 hour).\n\nDo not wait until the last day — renew at least 2–3 days before expiry.`,
    },
    {
        cat: 'admin',
        q: 'My plan has expired — can we still use the app?',
        a: `Yes, in view only mode. Everyone can still log in and see all old data (attendance, leads, orders, reports…), but nothing new can be added, edited or deleted until the plan is renewed. A red "Plan expired — view only" bar shows at the bottom of the app.\n\n1. Admin: tap the red bar (or Sidebar → Plan & Renewal) and renew.\n2. Staff: ask your company Admin to renew.\n3. Everything works again as soon as the renewal is verified.\n\nAll your data is safe — nothing is deleted on expiry. ("Account suspended" is different: contact support.)`,
    },
    {
        cat: 'admin',
        notIos: true,
        q: 'I made a payment but the plan is still not activated',
        a: `1. Paid by UPI QR? Make sure you entered the 12-digit UPI Ref No. and tapped "I Have Paid" — this sends the request for verification. Paid online? The plan activates by itself within a few minutes — pull down to refresh, or log out and in again. Keep the Razorpay payment ID from the SMS / email.\n2. Share your payment screenshot on WhatsApp with the support team.\n3. UPI payments are usually activated within 1 hour during business hours.\n4. If it has been more than 2 hours, contact support directly.`,
    },
    {
        cat: 'admin',
        q: 'Can I add more employees without changing my plan?',
        a: `1. The number of employees allowed depends on your plan.\n2. Admin: Sidebar → Plan & Renewal → choose your plan, enter the new number of employees and pay.\n3. Or contact support to increase the limit.\n4. Until the limit is increased, new employee accounts cannot be created.`,
    },
    {
        cat: 'admin',
        q: 'How do I add a new employee to the app?',
        a: `1. Go to Sidebar → Team & Settings → Users tab.\n2. Tap the "+" icon at the top right.\n3. Fill in Name, Email ID, Password, Mobile Number, and Role.\n4. Tap Save — the account is created.\n5. The employee downloads the app from Google Play Store and logs in using the email and password you set.\n\nNote: Each employee must have a unique email ID.`,
    },
    {
        cat: 'admin',
        q: 'How do I change an employee\'s role, target, or leave balance?',
        a: `1. Go to Sidebar → Team & Settings → Users tab.\n2. Tap on the employee you want to edit.\n3. Change their Role, Monthly Sales Target, Leave Balance, or any other detail.\n4. Tap Save — changes take effect immediately.\n5. The employee may need to close and reopen the app to see the updated role/permissions.`,
    },
    {
        cat: 'admin',
        q: 'I forgot my password — how do I reset it?',
        a: `Ask your company Admin to reset it: Team & Settings → Users → select your profile → change password. Then log in with the new password and change it from My Profile if you like.\n\nIf you are the Admin, contact support from the Contact tab.`,
    },
    {
        cat: 'admin',
        q: 'An employee left the company — how do I disable their access?',
        a: `1. Go to Sidebar → Team & Settings → Users tab.\n2. Tap on the employee's profile.\n3. Toggle their status to "Inactive" or disable their account.\n4. Their login is blocked immediately.\n5. Their past records are retained for your reference — nothing is deleted.`,
    },
    {
        cat: 'admin',
        q: 'An employee cannot see a certain screen or feature',
        a: `1. Go to Sidebar → Team & Settings → Permissions tab.\n2. Select the employee's role.\n3. Enable the module/feature you want them to see.\n4. The employee needs to close and reopen the app for changes to take effect.\n\nIf the feature is still not visible, contact your Super Admin — some features are restricted at the plan level.`,
    },
    {
        cat: 'reports',
        module: 'sales',
        q: 'How do I see the complete history of a client or machine?',
        a: `1. Go to Sidebar → "Serial Number".\n2. To search by machine: enter the Serial Number in the search bar — all installation, service, and PMS history appears.\n3. To search by client: tap the "Organization" tab, then type the hospital or company name.\n4. All records linked to that client — orders, payments, installations, service calls, PMS — are shown in one place.`,
    },
    {
        cat: 'reports',
        q: 'How do I check what a specific employee did on a particular day?',
        a: `1. Go to Sidebar → "Activity Timeline".\n2. Select the employee from the list.\n3. A complete timeline of their activities appears — visits, orders, payments, installations, service calls, attendance — sorted by date.\n4. Use the date filter to check activity for a specific day or date range.`,
    },
    {
        cat: 'sales',
        q: 'How do I see all employees\' sales performance in one place?',
        a: `1. Home → Sales → "Team Performance".\n2. Shows every employee's Orders, Sales Target, Achievement %, Payment Collections, and Pending Dues.\n3. Tap on any employee to drill into their individual data.\n4. Filter by month to see monthly performance trends.\n\nFor charts, open Home → Sales → "Sales Trends".`,
    },
    {
        cat: 'admin',
        q: 'How do I control what each employee or team can see in the app?',
        a: `1. Go to Sidebar → Team & Settings → Permissions tab.\n2. Select a role (Sales Executive, Service Engineer, Accountant, Store Keeper, etc.).\n3. Toggle any module ON or OFF.\n4. You can also set permissions for individual employees — user-specific settings override role settings.\n5. Employees need to close and reopen the app for changes to take effect.`,
    },
    {
        cat: 'service',
        q: 'How do I see all service history for a specific machine?',
        a: `Two ways:\n\n1. Go to Sidebar → Serial Number → enter the machine's Serial Number — all service, installation, and PMS records appear.\n\n2. Go to Home → Activity Report → Service Analysis → search by machine model or serial number to see all tickets, their status, and resolution details.`,
    },
    {
        cat: 'start',
        q: 'The app is running slow or crashing',
        a: `1. Close all background apps to free up RAM.\n2. Clear app cache: Settings → Apps → [App Name] → Clear Cache.\n3. Make sure your phone has at least 1 GB of free storage.\n4. Update the app from the Play Store.\n5. Restart your phone and try again.\n\nIf crashes continue, note what action causes it and contact support with your phone model and Android version.`,
    },
    {
        cat: 'start',
        q: 'How do I update the app to the latest version?',
        a: `1. Open the Google Play Store.\n2. Search for the app name.\n3. If an "Update" button is visible, tap it.\n4. Wait for installation to complete.\n\nNo data is lost during updates.`,
    },
    {
        cat: 'start',
        q: 'I accidentally deleted a record — can it be recovered?',
        a: `Records deleted from the app are permanently removed and cannot be recovered from the app itself.\n\nIf deleted recently:\n1. Contact support immediately with the details (client name, date, type of record).\n2. We may be able to recover it from database backups.\n\nTo avoid accidental deletions, only Admins should have delete permissions — set this in Team & Settings → Permissions.`,
    },
    {
        cat: 'start',
        q: 'Can I use the app on multiple phones at the same time?',
        a: `Yes, the same account can be logged in on multiple devices simultaneously.\n\nHowever:\n1. Attendance marking should be done from one device only to avoid location conflicts.\n2. Each employee should have their own login — sharing accounts causes mixed records.\n3. Contact your Admin if you need a separate account.`,
    },
    {
        cat: 'start',
        q: 'The date or time on my records is wrong',
        a: `Records use your phone's date and time at the moment of saving.\n\n1. Go to Settings → Date & Time → enable "Automatic Date & Time".\n2. Make sure your timezone is correct (Settings → Date & Time → Timezone).\n3. Restart the app after fixing.\n\nNote: Already saved records cannot have their timestamps changed.`,
    },
    {
        cat: 'start',
        q: 'How do I search for a specific record quickly?',
        a: `Every list screen has a Search Bar at the top.\n\n1. Type the client name, amount, date, or any keyword — results filter in real time.\n2. For a client's full history: Sidebar → Serial Number → Organization tab.\n3. For employee activity: Sidebar → Activity Timeline.\n4. For sales and collection figures: Home → Sales → Sales Trends or Team Performance.`,
    },
    {
        cat: 'sales',
        q: 'I added a new lead but it is not at the top of the list',
        a: `The Leads list shows newest leads first by default.\n\n1. Check the sort chip next to the filters — if it says "Follow-up date", tap it to switch back to "Newest first".\n2. Clear any filter (Status, Stage, 🌐 Website) and the search box.\n3. Check the date tabs (Day / Month / FY) — a lead outside the selected period is not shown.\n4. Pull down to refresh.`,
    },
    {
        cat: 'sales',
        q: 'What does the 🌐 WEBSITE badge mean?',
        a: `The lead came from an enquiry or catalogue download on the company website — it was created automatically.\n\nLead Details shows which page it came from. Tap the 🌐 Website chip on the Leads screen to see only these leads.`,
    },
    {
        cat: 'sales',
        q: 'How do I make website leads go to a particular salesperson?',
        a: `Admin only:\n\n1. Leads → ⋮ (top right) → "Website Leads".\n2. Choose the employee — every new website lead goes to them, with a notification.\n3. Choose "Default" to send them to the Admin again.\n\nTo move a single lead, open it and tap the ✎ next to "Assigned To".`,
    },
    {
        cat: 'sales',
        q: 'How do we connect our company website?',
        a: `Admin only:\n\n1. Company Profile → scroll to 🌐 Website Leads.\n2. Type your website address (e.g. www.yourcompany.com) → Save website.\n3. Tap "Send setup to developer" and send it to whoever made or manages your website. They connect your Contact form to the link, or paste the ready-made form.\n4. Fill the form on your website once with your own number — the lead should appear within a minute.\n\nNo website? Leave it empty — nothing else changes.`,
    },
    {
        cat: 'sales',
        q: 'The app says a lead already exists for this hospital or mobile',
        a: `To avoid duplicate leads, the app checks open leads across the company.\n\n1. If it is your own lead, choose "Add to Existing" — your visit is added to that lead.\n2. If a colleague owns it, talk to them or your manager before creating a new one.\n3. Choose "Create New" only if it really is a different hospital (same name in another town is fine).`,
    },
    {
        cat: 'sales',
        q: 'Why do I have to choose a Lost Reason?',
        a: `Lost reasons show the company why deals are lost (price, competitor, budget…) in Lead Insights.\n\nLeads lost for "No Requirement Now" or "Budget Not Available" also come back as a re-contact reminder after 3 and 6 months — so choose the reason honestly.`,
    },
    {
        cat: 'sales',
        q: 'How do I move a lead to the next stage?',
        a: `Either:\n\n1. Leads → Board → long-press the card (or tap ⇄) → choose the stage, or\n2. Open the lead → Log Visit → choose the new stage.\n\nThe change is recorded in the lead's history.`,
    },
    {
        cat: 'service',
        q: 'How do I assign a service call to an engineer?',
        a: `Admin / Manager:\n\n1. Open Service Call → tap the call.\n2. Next to "Assigned to", tap "Assign" (or "Change").\n3. Choose the engineer.\n\nThe call becomes "Assigned" and the engineer gets a notification that opens it directly.`,
    },
    {
        cat: 'service',
        q: 'An engineer cannot see a service call',
        a: `Engineers see calls they logged and calls assigned to them.\n\n1. Make sure the call is assigned to that engineer (open the call → Assigned to).\n2. Ask them to pull down to refresh, or tap "My Calls".\n3. Check the Open / Closed / All tabs and the date tabs.`,
    },
    {
        cat: 'service',
        q: 'What does "Open 3 days" in red mean?',
        a: `It is how long the call has been open since it was logged. It turns red after 48 hours.\n\nAdmin / Manager also get a 10 AM alert listing calls open for more than 2 days, and each engineer gets a list of their own.`,
    },
    {
        cat: 'service',
        q: 'How is spare part stock reduced?',
        a: `When a service call is saved or closed with spare parts, stock is reduced automatically:\n\n1. First from the stock issued to the engineer who records it.\n2. Then from office stock.\n\nIf you later change the quantity or remove the part, the stock is given back. Stock never goes below zero.`,
    },
    {
        cat: 'service',
        q: 'A spare part is not showing in the list when I add it to a call',
        a: `1. Type the name, part number or model in the search box of the part list.\n2. Make sure the part has been added in Sidebar → Spare Part Book.\n3. Close and reopen the part list — it reloads the latest parts.`,
    },
    {
        cat: 'service',
        q: 'How do I get an alert when a spare part is running low?',
        a: `1. Sidebar → Spare Part Book → open the part.\n2. Set "Low-stock alert at" (e.g. 3) and tap Save.\n\nWhen total stock (office + engineers) falls to that number, the part shows LOW STOCK and Store / Admin get a morning alert. Set 0 to turn it off.`,
    },
    {
        cat: 'leaves',
        q: 'What is the leave balance shown when applying for leave?',
        a: `It is your leave for this financial year: yearly quota + earned leave (worked on Sundays / holidays) − leave already used − absents − short days.\n\nDays waiting for approval are also taken off the "available" number so you don't apply twice against the same balance.`,
    },
    {
        cat: 'leaves',
        q: 'The app warns that my leave is more than my balance',
        a: `You can still apply — tap "Apply anyway".\n\nThe extra days beyond your balance may be treated as Leave Without Pay at payroll time. Choosing the type "Leave Without Pay" shows no warning.`,
    },
    {
        cat: 'start',
        q: 'I am getting too many alerts, or at the wrong time',
        a: `Admin: Sidebar → Team & Settings → Alerts tab.\n\n1. Switch off any alert you don't need.\n2. Tap the time to change it, or "Reset" to go back to the default.\n\nEach alert is sent only once a day.`,
    },
    {
        cat: 'start',
        q: 'I am not receiving notifications or daily alerts',
        a: `1. Phone Settings → Apps → [App Name] → Notifications → turn ON.\n2. Turn off battery optimisation for the app (Settings → Battery).\n3. Log out and log in once — this refreshes your notification registration.\n4. Check the bell icon in the app — all alerts are saved there too.\n5. Ask your Admin whether that alert is switched on in Team & Settings → Alerts.`,
    },
    {
        cat: 'attendance',
        module: 'hr',
        q: 'An employee does not open the app — will he still get the Day In reminder?',
        a: `Yes. Besides the reminders the phone sets for itself, the server sends a Day In reminder 15 minutes after the shift starts and a Day Out reminder 30 minutes after it ends, if they are not done.\n\nHe must have logged in on his phone at least once and allowed notifications. Admin can switch these two reminders off or change the time (for staff without a shift) in Team & Settings → Alerts.`,
    },
    {
        cat: 'office',
        module: 'hr',
        q: 'HR cannot see the Courier screen',
        a: `Admin: Team & Settings → Permissions → choose the role HR (or the person) → tick Courier → Save. New companies have it on for HR already.`,
    },
    {
        cat: 'sales',
        q: 'Where can I see the evening team report?',
        a: `Admin / Manager get it at 8 PM as a notification (also under the bell icon). Tap it to open Team Performance for details.`,
    },
    {
        cat: 'payroll',
        q: 'I can’t generate or recalculate a payslip — it says the month is locked',
        a: `That month was finalized (🔒). Ask an Admin to open Payroll → Generate → that month → Status → "Reopen (Admin)". A month already marked Paid can't be reopened.`,
    },
    {
        cat: 'payroll',
        q: 'Why did a late deduction appear on the payslip?',
        a: `Late-Coming is on in Salary Rules. Late = Day In after the shift start + grace (or after the "late after" time). The cut depends on the chosen rule: ½ day per late, ½ day per N lates, or ₹ per late — after the free lates. It never reduces leave balance.`,
    },
    {
        cat: 'payroll',
        q: 'An employee was absent without leave but no salary was cut',
        a: `Absent deduction is off by default. Turn on Payroll → Salary Rules → "Absent & One Day's Salary" → "Cut one day's salary for absent". It applies to payslips generated after saving.`,
    },
    {
        cat: 'payroll',
        q: 'How is overtime calculated?',
        a: `Hours worked on a working day beyond the employee's shift (or the standard hours you set), at least the minimum minutes, rounded down, up to the maximum per day. Rate = hourly salary × 1 / 1.5 / 2, or a fixed ₹ per hour. Work on a weekly off or holiday earns leave instead of overtime.`,
    },
    {
        cat: 'payroll',
        q: 'The bank sheet shows long numbers like 1.23E+11',
        a: `Account numbers are saved as text in the Bank Transfer Sheet. If your Excel still converts them, open the file and set that column to Text before editing.`,
    },
    {
        cat: 'leaves',
        q: 'Where does a half-day leave go — which balance?',
        a: `Half day is not a separate type. Choose the leave type (CL / SL / EL / Comp Off) and tick "Half day" — 0.5 is taken from that type. With Leave Without Pay, half a day's salary is cut.`,
    },
    {
        cat: 'leaves',
        q: 'I don’t see the "Half day" checkbox',
        a: `It appears only when From and To are the same date and the company allows half-day leave (Payroll → Salary Rules → Leave Policy → "Allow half-day leave").`,
    },
    {
        cat: 'leaves',
        q: 'Leave days are counting Sundays / holidays',
        a: `Turn off "Count weekly offs / holidays inside a leave as leave days" in Salary Rules → Leave Policy. Only working days are then counted.`,
    },
    {
        cat: 'leaves',
        q: 'How do I carry forward leave to the next year?',
        a: `After 31 March: Leaves → 💼 Leave Balances → choose the year that ended → "↪ Carry forward" → check the preview → Carry forward. Only types marked "Carry" move, up to their maximum.`,
    },
    {
        cat: 'attendance',
        q: 'Someone has a different weekly off (e.g. Monday)',
        a: `Team & Settings → edit the employee → "Weekly off & shift" → "Own schedule" → choose Mon. Their attendance, leave balance and Day-In alert then treat Monday as off.`,
    },
    {
        cat: 'attendance',
        q: 'Day In / Day Out reminders come at the wrong time',
        a: `Reminders follow your shift time. Ask HR to set the shift in Salary Rules (company default) or on your profile in Team & Settings. Reopen the app once after it changes.`,
    },
    {
        cat: 'admin',
        module: 'hr',
        q: 'How do I see everything about one employee?',
        a: `Team & Settings → Users → "📊 360" on their card (or Sidebar → Activity Timeline → choose the employee → "📊 360"). Use the period chips for this month, this FY, last FY or all time.`,
    },
    {
        cat: 'payroll',
        q: 'How do I settle an employee who is leaving?',
        a: `Employee 360 → "Full & Final settlement" → enter the last working day → Calculate → Save → Share PDF → Mark as Paid after paying. Delete it before it is paid if something is wrong.`,
    },
    {
        cat: 'sales',
        q: 'Nearby Leads shows "No open lead has a saved location yet"',
        a: `Leads get a location when created from a visit with GPS, or when a visit with GPS is logged for them. Meanwhile use the "By city" tab.`,
    },
    {
        cat: 'sales',
        q: 'The map is blank in Nearby Leads / live tracking',
        a: `In Expo Go the map may stay blank; the Play Store app uses the company's Google Maps key. Check that location is on and the internet is working.`,
    },
    {
        cat: 'expenses',
        q: 'Where can I see my Day Out expenses?',
        a: `Open Expenses → "Day Out" (or "All"). Every day with DA / Hotel / Misc entered at Day Out is listed with a purple DAY OUT tag. These are paid with your salary, so they never need approval. To change one, edit that day's Day Out entry.`,
    },
    {
        cat: 'expenses',
        q: 'How do I ask approval before buying something?',
        a: `In Expenses tap the orange 🛒 button, enter the estimated amount and the reason, and send it. After it is approved, buy it, open the request (Requests tab) and tap "Add Bill / Claim".`,
    },
    {
        cat: 'expenses',
        q: 'Why was my claim approved automatically?',
        a: `It was made against an approved purchase request and the bill was within the approved amount. If the bill is more than approved, the claim waits for approval as usual.`,
    },
    {
        cat: 'expenses',
        q: 'The app says my expense needs approval first',
        a: `Your company has set a pre-approval limit. For purchases above it, tap "Ask Approval" so your manager approves before you buy. You can still choose "Submit Claim Anyway" — it then waits for normal approval.`,
    },
    {
        cat: 'admin',
        q: 'How do I fill missing details for all employees at once?',
        a: `Team & Settings → Setup → Employees → "Download Current Employees". Fill the empty columns in Excel, upload the file and turn on "Fill details for existing employees". Only the cells you filled are saved.`,
    },
    {
        cat: 'admin',
        q: 'Joining dates from Excel are wrong or empty',
        a: `Type dates as 2026-01-15 or 15/01/2026, or use a normal Excel date cell. If a date cannot be read, the preview lists it and leaves that date empty.`,
    },
    {
        cat: 'admin',
        q: 'Can I fill the Company Profile from Excel?',
        a: `Yes. Team & Settings → Setup → Company Profile → "Download Company Sheet", fill the Value column and upload it. You see every change before saving. Logo, signature, QR code and office location are set in Company Profile itself.`,
    },
    {
        cat: 'start',
        q: 'My visiting card / profile shows the wrong designation',
        a: `Ask your Admin to open Team & Settings → Users → your name and choose the right Designation (Sales Executive or Service Engineer), then log out and log in once.`,
    },
    {
        cat: 'start',
        q: 'Activity Plan or Tasks button is missing from the bottom bar',
        a: `They are on for everyone unless an Admin switched them off. Ask your Admin to check Team & Settings → Permissions for your role (or for you), then close and reopen the app.`,
    },
    {
        cat: 'sales',
        q: 'A hospital / client is not in the list when I add a visit, lead or order',
        a: `Type at least 2 letters of its name, city or mobile in the picker's search box — the app also searches all saved organizations on the server. If it still does not appear, add it as a new organization first.`,
    },
    {
        cat: 'attendance',
        q: 'Why does the Live Map ignore some points or show fewer km?',
        a: `Sometimes a phone reports an old or rough location that jumps far away for a moment. Such impossible jumps are left out of the km and the route line, and the note above the map tells how many were ignored. Work records with such a location still appear in the list, marked "GPS location looked wrong".`,
    },
    {
        cat: 'office',
        q: 'A parcel was sent from office for one of our employees — how will he know?',
        a: `Share the courier with him: in Courier tap "Share" on the entry (or pick "Related Employees" while logging it), tick his name and tap Share.\n\n• He gets a notification at once.\n• The entry shows in his own Courier list as "Shared with you".\n• He can mark it Delivered / Received himself.\n• Every morning, while it is pending, he gets a reminder.\n\nOnly Admin, Manager, Account, HR and Store can share.`,
    },
    {
        cat: 'office',
        q: 'Why do I see a courier in my list that I did not add?',
        a: `The office shared it with you because the parcel concerns your customer or your work. Open it to see the details, track it with the orange button, and mark it Delivered / Received once done.`,
    },
    {
        cat: 'office',
        q: 'How do I track a courier?',
        a: `In Courier, tap the orange "Track" button on the entry (or in its details). The courier company's tracking page opens — for Blue Dart, Delhivery, DHL, FedEx, Xpressbees, Ecom Express and Ekart the number is already filled in. For DTDC, India Post and other couriers the docket number is copied: paste it on their page. Tapping the docket number also copies it.`,
    },
    {
        cat: 'orders',
        q: 'How do I add or change the PO / cheque / bill photo after saving?',
        a: `Open the saved order, payment, expense, service call or installation. In its details tap Add / Replace / Delete under the photo — it saves immediately.`,
    },
];

/** Lower-case words of the search box; every word must match. */
const searchWords = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean);

const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Every word must appear at the start of a word ("late" finds "Late", not "recalculate"). */
const matchesAll = (haystack: string, words: string[]) =>
    words.every((w) => new RegExp(`(^|[^a-z0-9])${escapeRe(w)}`).test(haystack));

/** Shows text with the searched words in bold yellow. */
function Highlight({ text, words, style }: { text: string; words: string[]; style?: any }) {
    if (!words.length) return <Text style={style}>{text}</Text>;
    const escaped = words.map(escapeRe);
    const parts = text.split(new RegExp(`(${escaped.join('|')})`, 'gi'));
    return (
        <Text style={style}>
            {parts.map((part, i) =>
                words.includes(part.toLowerCase())
                    ? <Text key={i} style={{ backgroundColor: '#fff3a0', fontWeight: 'bold' }}>{part}</Text>
                    : part
            )}
        </Text>
    );
}

type TabKey = 'contact' | 'guide' | 'faq';

export default function HelpSupportScreen() {
    const headerTop = useHeaderTop();
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<TabKey>('contact');
    const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
    const [expandedGuide, setExpandedGuide] = useState<string | null>(null);
    const [activeCat, setActiveCat] = useState<CatKey | 'all'>('all');
    const [query, setQuery] = useState('');
    const { currentUser, companyProfile } = useData();

    // Only topics for the modules this company has (SuperAdmin sees everything).
    const isVisible = (item: { cat: CatKey; module?: HelpModule; notIos?: boolean }) => {
        if (item.notIos && Platform.OS === 'ios') return false;
        const mod = item.module || CAT_BY_KEY[item.cat].module;
        if (mod === 'common' || currentUser?.role === 'SuperAdmin') return true;
        const enabled: string[] = companyProfile?.enabledModules || ['sales', 'service', 'hr'];
        return enabled.includes(mod);
    };
    const guides = useMemo(() => GUIDE_SECTIONS.filter(isVisible), [companyProfile, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps
    const faqs = useMemo(() => FAQS.filter(isVisible), [companyProfile, currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

    const words = useMemo(() => searchWords(query), [query]);
    const searching = words.length > 0;
    const guideHits = useMemo(() => !searching ? [] : guides
        .filter((g) => matchesAll(`${g.title} ${g.intro ?? ''} ${g.steps.join(' ')} ${g.note ?? ''} ${CAT_BY_KEY[g.cat].label} ${CAT_BY_KEY[g.cat].keywords}`.toLowerCase(), words))
        .sort((x, y) => Number(matchesAll(y.title.toLowerCase(), words)) - Number(matchesAll(x.title.toLowerCase(), words))),
        [guides, words, searching]);
    const faqHits = useMemo(() => !searching ? [] : faqs
        .filter((f) => matchesAll(`${f.q} ${f.a} ${CAT_BY_KEY[f.cat].label} ${CAT_BY_KEY[f.cat].keywords}`.toLowerCase(), words))
        .sort((x, y) => Number(matchesAll(y.q.toLowerCase(), words)) - Number(matchesAll(x.q.toLowerCase(), words))),
        [faqs, words, searching]);

    // Category chips: only categories that have something in the open tab.
    const tabItems: { cat: CatKey }[] = activeTab === 'faq' ? faqs : guides;
    const chipCats = CATEGORIES.filter((c) => tabItems.some((i) => i.cat === c.key));
    const shownCats = activeCat === 'all' ? chipCats : chipCats.filter((c) => c.key === activeCat);
    const [supportConfig, setSupportConfig] = useState(DEFAULTS);
    const [loadingConfig, setLoadingConfig] = useState(true);


    const loadSupportConfig = async () => {
        try {
            const data = await fetchPublicSupportSettings();
            setSupportConfig({
                supportPhone: data.supportPhone || DEFAULTS.supportPhone,
                supportEmail: data.supportEmail || DEFAULTS.supportEmail,
                userManualUrl: data.userManualUrl || DEFAULTS.userManualUrl,
                videoTutorialUrl: data.videoTutorialUrl || DEFAULTS.videoTutorialUrl,
            });
        } catch (e) {
            console.log('Support config load failed, using defaults:', e);
        } finally {
            setLoadingConfig(false);
        }
    };
    useEffect(() => {
        loadSupportConfig();
    }, []);

    const openWhatsApp = () => Linking.openURL(`https://wa.me/${supportConfig.supportPhone}`);
    const openCall = () => Linking.openURL(`tel:+${supportConfig.supportPhone}`);
    const openEmail = () => Linking.openURL(`mailto:${supportConfig.supportEmail}`);
    const openManual = () => Linking.openURL(supportConfig.userManualUrl);
    const openVideo = () => Linking.openURL(supportConfig.videoTutorialUrl);
    const openSetupGuide = () => Linking.openURL(SETUP_GUIDE_URL);

    const toggleFaq = (key: string) => setExpandedFaq(prev => prev === key ? null : key);
    const toggleGuide = (key: string) => setExpandedGuide(prev => prev === key ? null : key);

    const renderGuide = (section: GuideSection) => {
        const key = section.title;
        const isOpen = expandedGuide === key;
        return (
            <TouchableOpacity
                key={key}
                style={[styles.guideCardFull, isOpen && styles.guideCardFullOpen]}
                onPress={() => toggleGuide(key)}
                activeOpacity={0.85}
            >
                <View style={styles.guideCardHeader}>
                    <View style={[styles.guideIconBoxColored, { backgroundColor: section.color }]}>
                        <Ionicons name={section.icon as any} size={18} color="white" />
                    </View>
                    <Highlight text={section.title} words={words} style={styles.guideCardTitle} />
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#aaa" />
                </View>
                {isOpen && (
                    <View style={styles.stepsBox}>
                        {section.intro ? <Highlight text={section.intro} words={words} style={styles.guideIntro} /> : null}
                        {section.steps.map((step, stepIndex) => (
                            <View key={stepIndex} style={styles.stepRow}>
                                <View style={[styles.stepNum, { backgroundColor: section.color }]}>
                                    <Text style={styles.stepNumText}>{stepIndex + 1}</Text>
                                </View>
                                <Highlight text={step} words={words} style={styles.stepText} />
                            </View>
                        ))}
                        {section.note ? <Highlight text={section.note} words={words} style={styles.guideNote} /> : null}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const renderFaq = (item: FaqItem) => {
        const key = item.q;
        const isOpen = expandedFaq === key;
        return (
            <TouchableOpacity
                key={key}
                style={[styles.faqCard, isOpen && styles.faqCardOpen]}
                onPress={() => toggleFaq(key)}
                activeOpacity={0.85}
            >
                <View style={styles.faqHeader}>
                    <Highlight text={item.q} words={words} style={[styles.faqQuestion, isOpen && { color: '#3b5998' }]} />
                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#3b5998' : '#aaa'} />
                </View>
                {isOpen && (
                    <View style={styles.answerBox}>
                        <Highlight text={item.a} words={words} style={styles.faqAnswer} />
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const catHeader = (c: (typeof CATEGORIES)[number], count: number) => (
        <View key={`h-${c.key}`} style={styles.catHeaderRow}>
            <View style={styles.categoryIconBox}>
                <Ionicons name={c.icon} size={15} color="#3b5998" />
            </View>
            <Text style={styles.catHeaderText}>{c.label}</Text>
            <View style={styles.categoryCount}><Text style={styles.categoryCountText}>{count}</Text></View>
        </View>
    );

    const TABS: { key: TabKey; label: string; icon: any }[] = [
        { key: 'contact', label: 'Contact', icon: 'call' },
        { key: 'guide', label: 'User Guide', icon: 'book' },
        { key: 'faq', label: 'FAQ', icon: 'help-circle' },
    ];

    if (loadingConfig) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color="#3b5998" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: headerTop }]}>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="arrow-back" size={24} color="#333" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Help & Support</Text>
                <View style={{ width: 24 }} />
            </View>

            <View style={styles.tabRow}>
                {TABS.map(tab => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={[styles.tab, isActive && styles.tabActive]}
                            onPress={() => setActiveTab(tab.key)}
                        >
                            <Ionicons name={tab.icon} size={16} color={isActive ? '#3b5998' : '#aaa'} />
                            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.searchWrap}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color="#888" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search help — e.g. salary, day in, password, order"
                        placeholderTextColor="#aaa"
                        value={query}
                        onChangeText={setQuery}
                        autoCorrect={false}
                        returnKeyType="search"
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={() => setQuery('')}>
                            <Ionicons name="close-circle" size={18} color="#aaa" />
                        </TouchableOpacity>
                    )}
                </View>
                {!searching && activeTab !== 'contact' && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
                        {[{ key: 'all', label: 'All', icon: 'apps' } as const, ...chipCats].map((c) => {
                            const on = activeCat === c.key;
                            return (
                                <TouchableOpacity key={c.key} style={[styles.chip, on && styles.chipOn]} onPress={() => setActiveCat(c.key as CatKey | 'all')}>
                                    <Ionicons name={c.icon as any} size={13} color={on ? 'white' : '#3b5998'} />
                                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                {searching && (
                    <>
                        <Text style={styles.introText}>
                            {guideHits.length + faqHits.length === 0
                                ? `Nothing found for "${query.trim()}". Try another word, or contact us from the Contact tab.`
                                : `${guideHits.length + faqHits.length} result(s) for "${query.trim()}"`}
                        </Text>
                        {guideHits.length > 0 && <Text style={styles.sectionTitle}>User Guide ({guideHits.length})</Text>}
                        {guideHits.map(renderGuide)}
                        {faqHits.length > 0 && <Text style={styles.sectionTitle}>FAQ ({faqHits.length})</Text>}
                        {faqHits.map(renderFaq)}
                    </>
                )}

                {!searching && (<>

                {activeTab === 'contact' && (
                    <>
                        <Text style={styles.sectionTitle}>Contact Us</Text>
                        <View style={styles.contactRow}>
                            <TouchableOpacity style={styles.contactCard} onPress={openWhatsApp}>
                                <Ionicons name="logo-whatsapp" size={26} color="#25D366" />
                                <Text style={styles.contactLabel}>WhatsApp</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.contactCard} onPress={openCall}>
                                <Ionicons name="call" size={24} color="#3b5998" />
                                <Text style={styles.contactLabel}>Call Us</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.contactCard} onPress={openEmail}>
                                <Ionicons name="mail" size={24} color="#e67e22" />
                                <Text style={styles.contactLabel}>Email</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.sectionTitle}>Resources</Text>
                        <TouchableOpacity style={styles.guideCard} onPress={openManual}>
                            <View style={styles.guideIconBox}>
                                <Ionicons name="document-text" size={22} color="#d32f2f" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.guideTitle}>Download User Manual (PDF)</Text>
                                <Text style={styles.guideSubtitle}>Every screen, step by step, with screenshots</Text>
                            </View>
                            <Ionicons name="download-outline" size={20} color="#999" />
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.guideCard} onPress={openSetupGuide}>
                            <View style={[styles.guideIconBox, { backgroundColor: '#e8f5e9' }]}>
                                <Ionicons name="rocket" size={22} color="#2e7d32" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.guideTitle}>Download Setup Guide (PDF)</Text>
                                <Text style={styles.guideSubtitle}>First setup in 10 steps, email and WhatsApp automation</Text>
                            </View>
                            <Ionicons name="download-outline" size={20} color="#999" />
                        </TouchableOpacity>

                        {!!supportConfig.videoTutorialUrl && (
                        <TouchableOpacity style={styles.guideCard} onPress={openVideo}>
                            <View style={[styles.guideIconBox, { backgroundColor: '#ffebee' }]}>
                                <Ionicons name="play-circle" size={22} color="#d32f2f" />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.guideTitle}>Video Tutorial</Text>
                                <Text style={styles.guideSubtitle}>Watch a full walkthrough of the app</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>
                        )}

                        <View style={styles.quickLinksRow}>
                            <TouchableOpacity style={styles.quickLink} onPress={() => setActiveTab('guide')}>
                                <Ionicons name="book" size={16} color="#3b5998" />
                                <Text style={styles.quickLinkText}>View User Guide</Text>
                                <Ionicons name="chevron-forward" size={14} color="#3b5998" />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.quickLink} onPress={() => setActiveTab('faq')}>
                                <Ionicons name="help-circle" size={16} color="#3b5998" />
                                <Text style={styles.quickLinkText}>Browse FAQs</Text>
                                <Ionicons name="chevron-forward" size={14} color="#3b5998" />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.footerNote}>
                            We typically respond within a few hours on WhatsApp.
                        </Text>
                    </>
                )}

                {activeTab === 'guide' && (
                    <>
                        <Text style={styles.introText}>
                            Tap any feature below to see how to use it step by step.
                        </Text>
                        {shownCats.map((c) => {
                            const items = guides.filter((g) => g.cat === c.key);
                            return (
                                <View key={c.key}>
                                    {catHeader(c, items.length)}
                                    {items.map(renderGuide)}
                                </View>
                            );
                        })}
                        <Text style={styles.footerNote}>
                            Still stuck? Go to the Contact tab to reach us directly.
                        </Text>
                    </>
                )}

                {activeTab === 'faq' && (
                    <>
                        <Text style={styles.introText}>
                            Common questions by topic. Tap a question to see the answer.
                        </Text>
                        {shownCats.map((c) => {
                            const items = faqs.filter((f) => f.cat === c.key);
                            return (
                                <View key={c.key} style={styles.categoryBlock}>
                                    {catHeader(c, items.length)}
                                    {items.map(renderFaq)}
                                </View>
                            );
                        })}
                        <Text style={styles.footerNote}>
                            Didn&apos;t find your answer?{'\n'}Go to the Contact tab to reach us directly.
                        </Text>
                    </>
                )}
                </>)}

            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f6fa' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 15,
        alignItems: 'center',
        backgroundColor: 'white',
        elevation: 2,
    },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
    tabRow: {
        flexDirection: 'row',
        backgroundColor: 'white',
        paddingHorizontal: 15,
        paddingBottom: 12,
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    tab: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingVertical: 9,
        borderRadius: 10,
        backgroundColor: '#f5f6fa',
    },
    tabActive: {
        backgroundColor: '#eef1fb',
        borderWidth: 1.5,
        borderColor: '#3b5998',
    },
    tabText: { fontSize: 12, fontWeight: '600', color: '#aaa' },
    tabTextActive: { color: '#3b5998' },
    content: { padding: 16, paddingBottom: 60 },
    searchWrap: { backgroundColor: 'white', paddingHorizontal: 15, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#eee' },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f6fa', borderRadius: 10, paddingHorizontal: 10, height: 40, gap: 8, borderWidth: 1, borderColor: '#e3e6ef' },
    searchInput: { flex: 1, fontSize: 14, color: '#333', paddingVertical: 0 },
    chipRow: { gap: 8, paddingTop: 10 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: '#eef1fb' },
    chipOn: { backgroundColor: '#3b5998' },
    chipText: { fontSize: 12, fontWeight: '600', color: '#3b5998' },
    chipTextOn: { color: 'white' },
    catHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 8 },
    catHeaderText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#3b5998' },
    introText: { fontSize: 13, color: '#888', marginBottom: 14, lineHeight: 19 },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#888',
        marginTop: 18,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.7,
    },
    contactRow: { flexDirection: 'row', gap: 10 },
    contactCard: {
        flex: 1,
        backgroundColor: 'white',
        borderRadius: 14,
        paddingVertical: 18,
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 5,
        shadowOffset: { width: 0, height: 2 },
    },
    contactLabel: { fontSize: 12, fontWeight: '600', color: '#333', marginTop: 7 },
    guideCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        elevation: 1,
    },
    guideIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#e3f2fd',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    guideTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
    guideSubtitle: { fontSize: 12, color: '#888', marginTop: 2 },
    quickLinksRow: { marginTop: 8, gap: 8 },
    quickLink: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#eef1fb',
        padding: 12,
        borderRadius: 10,
    },
    quickLinkText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3b5998' },
    guideCardFull: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
        elevation: 1,
    },
    guideCardFullOpen: {
        borderWidth: 1.5,
        borderColor: '#3b5998',
    },
    guideCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    guideIconBoxColored: {
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guideCardTitle: { flex: 1, fontSize: 14, fontWeight: 'bold', color: '#333' },
    stepsBox: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#eee' },
    stepRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-start' },
    stepNum: {
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
        marginTop: 1,
    },
    stepNumText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    stepText: { flex: 1, fontSize: 13, color: '#555', lineHeight: 20 },
    guideIntro: { fontSize: 13, color: '#333', lineHeight: 20, marginBottom: 12, fontWeight: '600' },
    guideNote: { fontSize: 12, color: '#777', lineHeight: 18, marginTop: 2, fontStyle: 'italic' },
    categoryBlock: { marginBottom: 8 },
    categoryHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'white',
        padding: 13,
        borderRadius: 12,
        elevation: 1,
    },
    categoryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    categoryIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: '#eef1fb',
        alignItems: 'center',
        justifyContent: 'center',
    },
    categoryTitle: { fontSize: 13, fontWeight: '700', color: '#333', flex: 1 },
    categoryCount: { backgroundColor: '#eef1fb', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
    categoryCountText: { fontSize: 11, fontWeight: 'bold', color: '#3b5998' },
    faqCard: {
        backgroundColor: '#f9f9fb',
        borderRadius: 10,
        padding: 12,
        marginTop: 5,
        marginLeft: 8,
        borderLeftWidth: 3,
        borderLeftColor: 'transparent',
    },
    faqCardOpen: { backgroundColor: '#f0f3ff', borderLeftColor: '#3b5998' },
    faqHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    faqQuestion: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1, marginRight: 8, lineHeight: 19 },
    answerBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#dde3f5' },
    faqAnswer: { fontSize: 13, color: '#555', lineHeight: 21 },
    footerNote: {
        textAlign: 'center',
        color: '#aaa',
        fontSize: 12,
        marginTop: 24,
        lineHeight: 20,
    },
});
