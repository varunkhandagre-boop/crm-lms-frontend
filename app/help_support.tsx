import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Linking,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

import { fetchPublicSupportSettings } from '../services/api/settings';

// =========================================================
// 🔥 DEFAULT FALLBACK
// =========================================================
const DEFAULTS = {
    supportPhone: '919999999999',
    supportEmail: 'support@yourcompany.com',
    userManualUrl: 'https://example.com/user-manual.pdf',
    videoTutorialUrl: 'https://youtube.com/your-tutorial-link',
};

// =========================================================
// 📋 USER GUIDE SECTIONS
// =========================================================
const GUIDE_SECTIONS = [
    {
        icon: 'finger-print',
        color: '#4caf50',
        title: 'Attendance (Day In / Day Out)',
        steps: [
            'Go to "Attendance" and tap Day In when you start work, Day Out when you finish.',
            'Make sure internet and GPS (Location) are turned ON before marking attendance.',
            'If it fails, close the app fully, reopen it, then try again.',
            'In low signal areas, move to a better coverage spot before marking.',
            'Your attendance status (Logged In / Logged Out / Not Marked) is visible directly on the home screen banner — no need to open the attendance screen to check.',
        ],
    },
    {
        icon: 'business',
        color: '#1565c0',
        title: 'Company Profile — Setup & Logo',
        steps: [
            'Go to Sidebar → "Company Profile" to set up your company details.',
            'Fill in Company Name, Address, Phone, Email, GST Number, and Website carefully — these details appear on every PDF: Payment Receipt, Delivery Challan, Order, Installation, PMS, Service, and Demo Reports.',
            'Upload your Company Logo — it appears on the top of all PDF documents.',
            'Upload your Signature image — it appears at the bottom of PDFs as the authorized signatory.',
            'Add Bank Details (Account No, IFSC, Bank Name, Branch) — these appear on Payment Receipts and Challans.',
            'Upload your UPI QR Code image — shown in the Payment Collection screen so clients can scan and pay directly.',
            'Tap Save after filling all details. Any update here reflects immediately across all modules.',
        ],
    },
    {
        icon: 'qr-code',
        color: '#00796b',
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
        title: 'Adding New Users / Employees',
        steps: [
            'Go to Sidebar → Admin Control → Users tab.',
            'Tap the "+" icon (top right) to add a new employee.',
            'Fill in the employee\'s Name, Email ID, Password, Mobile Number, and Role.',
            'The email and password you set here are the login credentials for that employee.',
            'The new employee downloads the app from the Google Play Store and logs in using the email and password you created.',
            'Each employee must have a unique email ID — duplicate emails are not allowed.',
            'If "Max Employees" limit is reached, contact the Super Admin to increase the limit.',
        ],
    },
    {
        icon: 'create',
        color: '#f57c00',
        title: 'Edit Employee — Role, Target, Leave Balance',
        steps: [
            'Go to Sidebar → Admin Control → Users tab.',
            'Tap on the employee whose details you want to change.',
            'From here you can change their Role, Monthly Sales Target, Leave Balance, Mobile Number, and other details.',
            'Tap Save after making changes — the employee will see updated details on their next app open.',
            'To reset or change their password, use the edit option and enter a new password.',
        ],
    },
    {
        icon: 'shield-checkmark',
        color: '#c62828',
        title: 'Permissions — Control What Each Employee Sees',
        steps: [
            'Go to Sidebar → Admin Control → Permissions tab. Only available to Admins.',
            'Select any role (Sales Executive, Service Engineer, Accountant, Store Keeper, etc.) to control what screens and features that role can access.',
            'Toggle any module ON or OFF — for example, hide "Payment Dues" from Sales team, or show "Orders" to Accountants.',
            'You can also set permissions for individual employees — user-specific settings override role settings.',
            'Employees need to close and reopen the app for permission changes to take effect.',
        ],
    },
    {
        icon: 'eye',
        color: '#2e7d32',
        title: 'Admin / Manager — Viewing All Team Data',
        steps: [
            'Admins and Managers can see data from all employees across all modules — Orders, Payments, Attendance, Leaves, Service Calls, etc.',
            'Accountants can also be given access to financial data (Orders, Payments, Dues) from the Permissions tab.',
            'Regular employees (Sales, Service) only see their own entries by default.',
            'To give a specific employee access to all data, go to Admin Control → Permissions and enable the required modules for their role.',
        ],
    },
    {
        icon: 'cart',
        color: '#ff9800',
        title: 'Order Booking',
        steps: [
            'Go to "Order Booking" from the Sales section.',
            'Select the client/hospital from the list, or add a new one.',
            'Choose Cash or Credit sale, enter PO number, amount, and products.',
            'Tap Submit — the order is saved and the customer gets a WhatsApp/Email update automatically (if automation is enabled).',
            'The order PDF (Delivery Challan) will include your company name, logo, address, and bank details from Company Profile.',
        ],
    },
    {
        icon: 'cash',
        color: '#27ae60',
        title: 'Collect Payment',
        steps: [
            'Go to "Collect Payment" from the Sales section.',
            'Select the client and enter the amount received.',
            'Choose payment mode (Cash, UPI, NEFT, Cheque) and add reference details if needed.',
            'Submitting will automatically reduce the client\'s pending dues.',
            'A Payment Receipt PDF is generated with your company logo, address, and bank details.',
        ],
    },
    {
        icon: 'time',
        color: '#c0392b',
        title: 'Pending Dues (Accountant)',
        steps: [
            'Go to "Pending Dues" under Sales Analysis.',
            'Every approved order automatically creates a due entry — you do not need to add it manually.',
            'When a payment is collected, the due balance reduces automatically.',
            'Filter by client or status to see outstanding amounts at a glance.',
            'Admins and Accountants can see dues for all clients across the team.',
        ],
    },
    {
        icon: 'construct',
        color: '#795548',
        title: 'Installation Report',
        steps: [
            'Go to "Installation" under Activity Report.',
            'Select the client and product being installed.',
            'Add installation date, location, serial number, and notes.',
            'Once saved, an Installation Report PDF can be generated with full company details from Company Profile.',
            'This shows up on your dashboard for that day.',
        ],
    },
    {
        icon: 'settings',
        color: '#607d8b',
        title: 'Service Call',
        steps: [
            'Go to "Service Call" under Activity Report.',
            'Select the client and describe the issue.',
            'The ticket stays "Open" until you or your manager mark it resolved.',
            'You can track all open tickets from the same screen.',
            'Service Report PDF includes company header from Company Profile.',
        ],
    },
    {
        icon: 'pie-chart',
        color: '#673ab7',
        title: 'Service Analysis',
        steps: [
            'Go to "Service Analysis" under Activity Report.',
            'See all service calls — open, closed, and pending — across machines and clients.',
            'Search by machine model, serial number, or client name to find service history of any specific machine.',
            'Admins and Service Managers can use this to track team performance and pending tickets.',
            'Filter by date range to see service activity for a specific period.',
        ],
    },
    {
        icon: 'pricetag',
        color: '#00838f',
        title: 'Serial Number — Full Client & Machine Data',
        steps: [
            'Go to Sidebar → "Serial Number".',
            'To find a machine: enter the Serial Number in the search bar — all history (installation, service, PMS) appears.',
            'To find a client: tap the "Organization" tab, then type the organization/hospital name in the search bar.',
            'The client\'s full details appear — all orders, payments, installations, service calls, and PMS reports linked to that organization.',
            'This is the fastest way to get a complete picture of any client or machine.',
        ],
    },
    {
        icon: 'time',
        color: '#37474f',
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
        title: 'Sales Calculation',
        steps: [
            'Go to Sidebar → "Sales Calculation".',
            'Shows a summary for every employee — total Orders, Sales Target, Achievement %, Payment Collections, and Pending Dues.',
            'Admins use this to compare team performance at a glance.',
            'Tap on any employee to drill down into their individual sales data.',
            'Filter by month to see monthly performance trends.',
        ],
    },
    {
        icon: 'stats-chart',
        color: '#1a237e',
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
        title: 'Leads Management',
        steps: [
            'Go to "Visits DSR" under Activity Report — leads are also managed from the same screen.',
            'Add a new lead with client name, contact, product interest, and next follow-up date.',
            'Home screen badge shows how many follow-ups are due TODAY.',
            'Once a deal is closed, mark the lead as "Converted" to remove it from the follow-up count.',
        ],
    },
    {
        icon: 'shield-checkmark',
        color: '#4caf50',
        title: 'PMS Schedule (Preventive Maintenance)',
        steps: [
            'Go to "PMS Report" under Activity Report.',
            'Add a PMS entry with client, machine, last service date, and next service date.',
            'The home screen badge shows PMS entries due THIS MONTH that are not yet marked Done.',
            'Once maintenance is done, mark the entry as "Done" to clear it from the badge.',
            'PMS Report PDF includes full company header and client details.',
        ],
    },
    {
        icon: 'cube',
        color: '#e67e22',
        title: 'Courier Tracking',
        steps: [
            'Go to "Courier" under HR & Operations.',
            'Add sender, receiver, and courier partner details.',
            'Track the status until it is marked delivered.',
        ],
    },
    {
        icon: 'chatbubbles',
        color: '#2e7d32',
        title: 'Automation Settings (WhatsApp / Email)',
        steps: [
            'Only visible to Admins with the Automation Add-on active.',
            'Turn on WhatsApp and/or Email, choose your provider, and paste your API key.',
            'Once saved, customers automatically get updates for orders, payments, installations, services, and couriers.',
        ],
    },
    {
        icon: 'people-circle',
        color: '#3b5998',
        title: 'Admin Control (Overview)',
        steps: [
            'Go to Sidebar → "Admin Control" — only visible to Admins.',
            'Users Tab: Add, edit, or disable employee accounts.',
            'Permissions Tab: Control what each role or employee can see in the app.',
            'From here you can also change an employee\'s role, target, leave balance, and password.',
            'Changes take effect immediately — employee may need to reopen the app.',
        ],
    },
    {
        icon: 'notifications',
        color: '#ff9800',
        title: 'Notifications',
        steps: [
            'Tap the bell icon (top right) to see all notifications.',
            'The red badge shows how many unread notifications you have.',
            'Notifications are sent automatically when orders, payments, tasks, or leaves are added.',
            'Tap "Mark All Read" to clear the badge count.',
        ],
    },
    {
        icon: 'person-circle',
        color: '#607d8b',
        title: 'My Profile',
        steps: [
            'Tap your avatar/initials (top right of home screen) to open your profile.',
            'You can update your profile photo, name, and contact details here.',
            'Your Employee ID and role are shown in the sidebar.',
            'To change your password, use "Forgot Password" on the login screen.',
        ],
    },
    {
        icon: 'card',
        color: '#1565c0',
        title: 'Subscription & Renewal',
        steps: [
            'Go to "Subscription & Renewal" from the sidebar.',
            'Select a plan, enter number of employees, and optionally add the Automation add-on.',
            'Scan the UPI QR code to pay, then tap "I Have Paid".',
            'Your plan activates once the payment is verified (usually within 1 hour).',
            'A warning badge appears in the sidebar showing days remaining when plan is within 30 days of expiry. Tap it to go directly to renewal.',
        ],
    },
];

// =========================================================
// 📋 FAQ DATA
// =========================================================
const FAQS = [
    {
        category: 'Attendance',
        q: 'Problem with Day In — attendance is not marking',
        a: `Follow these steps in order:\n\n1. Make sure your internet is ON (mobile data or Wi-Fi).\n2. Fully close the app and reopen it (don't just minimise).\n3. Wait 5–10 seconds after the app loads, then try Day In again.\n4. Make sure Location / GPS is turned ON — attendance requires your location.\n5. If it still fails, go to Settings → Apps → [App Name] → Clear Cache, then restart the app.`,
    },
    {
        category: 'Attendance',
        q: 'Problem with Day Out — button not responding or showing error',
        a: `Follow these steps:\n\n1. Check internet — if you are in a low-coverage area, move to a spot with better signal.\n2. Turn on GPS/Location if it is off (Settings → Location → Turn On).\n3. Close the app completely and restart it.\n4. Try Day Out again.\n\nTip: If you are in a basement or underground area, step outside briefly to get a GPS fix, then mark Day Out.`,
    },
    {
        category: 'Attendance',
        q: 'GPS / Location not working for attendance',
        a: `1. Go to Settings → Location → make sure it is ON.\n2. Set Location Mode to "High Accuracy".\n3. For the app: Settings → Apps → [App Name] → Permissions → Location → Allow.\n4. Restart the app and try again.\n\nIf accuracy is poor, stand near a window or step outside.`,
    },
    {
        category: 'Attendance',
        q: 'I forgot to mark Day In / Day Out — what should I do?',
        a: `If you missed marking attendance:\n\n1. Contact your Admin or HR immediately and inform them.\n2. The Admin can manually update or note your attendance from the Admin Control panel.\n3. Do not try to mark it later on your own — the system records the actual time of marking.\n\nNote: Always mark Day In as soon as you start work to avoid discrepancies.`,
    },
    {
        category: 'Attendance',
        q: 'My attendance is showing "Not Marked" on the home screen even after marking',
        a: `1. Pull down on the home screen to refresh the data.\n2. Close the app fully and reopen it.\n3. Check if your internet was ON when you marked attendance — if it was off, the entry may not have saved.\n4. Go to the Attendance screen and check if today's entry appears in the list.\n\nIf the entry is missing, contact your Admin to manually record it.`,
    },
    {
        category: 'Connectivity',
        q: 'App is not loading or showing a blank screen',
        a: `1. Check if your internet is working — try opening a website in your browser.\n2. If internet is off, turn it on and wait 10 seconds.\n3. Close the app fully and reopen it.\n4. If still blank: Settings → Apps → [App Name] → Clear Cache, then restart.\n5. If nothing works, uninstall and reinstall the app.`,
    },
    {
        category: 'Connectivity',
        q: 'Data is not syncing — I saved something but it is not showing',
        a: `This is almost always an internet issue.\n\n1. Check your connection — switch from mobile data to Wi-Fi (or vice versa).\n2. Pull down on the list screen to refresh.\n3. Close the app and reopen it.\n4. In a low-signal area, data will auto-sync once connectivity is restored — no data is lost.`,
    },
    {
        category: 'Connectivity',
        q: 'The app works on Wi-Fi but not on mobile data',
        a: `1. Check if mobile data is enabled for this app: Settings → Apps → [App Name] → Data Usage → enable "Mobile Data".\n2. Some phones restrict background data — disable "Data Saver" mode temporarily.\n3. Check if your mobile data plan is active and has balance.\n4. Try turning mobile data off and on again.\n5. Restart the app after making these changes.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'How do I update company details — name, address, contact?',
        a: `1. Go to Sidebar → "Company Profile".\n2. Update your Company Name, Address, Phone, Email, GST Number, and Website.\n3. Tap Save — these details reflect immediately on all new PDFs generated (Payment Receipt, Delivery Challan, Order, Installation, PMS, Service, Demo Reports).\n\nNote: Already generated PDFs will not change — only new ones will use the updated details.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'Company logo is not appearing on PDFs',
        a: `1. Go to Sidebar → Company Profile.\n2. Tap the Logo field and upload your company logo (PNG or JPG recommended, square size preferred).\n3. Tap Save.\n4. Generate a new PDF — the logo should now appear at the top.\n\nIf the logo still does not show: make sure the image is under 1 MB and in JPG or PNG format.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'PDF is showing wrong address or blank address',
        a: `1. Go to Sidebar → Company Profile.\n2. Check the Address field — make sure it is filled completely (Street, City, State, Pincode).\n3. Tap Save.\n4. Generate a new PDF — address will now appear correctly.\n\nTip: Fill the address in one complete line for best results on PDFs.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'Bank details are not showing on Payment Receipt',
        a: `1. Go to Sidebar → Company Profile → scroll down to Bank Details.\n2. Fill in Bank Name, Account Number, IFSC Code, and Branch for Bank 1 (and Bank 2 if applicable).\n3. Tap Save.\n4. Generate a new Payment Receipt — bank details will now appear at the bottom.\n\nNote: Leave Bank 2 blank if you only have one account.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'UPI QR Code is not showing in the app',
        a: `1. Go to Sidebar → Company Profile.\n2. Upload your UPI QR Code image in the "QR Code" field.\n3. Also enter your UPI ID in the UPI ID field.\n4. Tap Save.\n5. Open the Collect Payment screen — your QR code will now appear at the top.\n\nTo share the QR code: tap the Share button next to it to send via WhatsApp or any other app.`,
    },
    {
        category: 'Company Profile & PDFs',
        q: 'Signature is not appearing on PDFs',
        a: `1. Go to Sidebar → Company Profile.\n2. Upload your signature image in the "Signature" field (white background recommended).\n3. Tap Save.\n4. Generate a new PDF — the signature will appear at the bottom as the authorized signatory.\n\nTip: Use a clear signature on a white background for best print quality.`,
    },
    {
        category: 'Reports & PDFs',
        q: 'How do I generate and share a PDF (Receipt, Challan, Report)?',
        a: `1. Open the relevant record — Order, Payment, Installation, Service, PMS, or Demo.\n2. Tap the PDF or Share icon (top right of the detail screen).\n3. The PDF is generated automatically with your company details, logo, and data.\n4. A share sheet opens — choose WhatsApp, Email, or any other app to send it.\n5. You can also download it to your phone storage from the share options.`,
    },
    {
        category: 'Reports & PDFs',
        q: 'How do I generate a Payment Receipt for a client?',
        a: `1. Go to "Collect Payment" under Sales Analysis.\n2. Find the payment entry for which you need the receipt.\n3. Tap on it to open the details.\n4. Tap the PDF/Share icon — a Payment Receipt is generated with your company header, client details, amount, payment mode, and bank details.\n5. Share it directly with the client via WhatsApp or Email.`,
    },
    {
        category: 'Reports & PDFs',
        q: 'How do I generate a Delivery Challan / Order PDF?',
        a: `1. Go to "Order Booking" under Sales Analysis.\n2. Find the order entry.\n3. Tap on it to open the details.\n4. Tap the PDF/Share icon — a Delivery Challan is generated with your company logo, client details, products, and amounts.\n5. Share with the client or print it directly.`,
    },
    {
        category: 'Reports & PDFs',
        q: 'PDF is showing blank or missing data fields',
        a: `Blank fields in PDFs happen when the original record was saved without filling all details, OR when Company Profile is incomplete.\n\n1. First check Company Profile — make sure Name, Address, Phone, and Bank Details are filled.\n2. Open the specific record and check if all fields are filled.\n3. Edit the record and fill missing details, then regenerate the PDF.`,
    },
    {
        category: 'Orders & Payments',
        q: 'I submitted an order but it is not showing in the list',
        a: `1. Check your internet connection — the order may not have saved if you were offline.\n2. Pull down on the Orders screen to refresh.\n3. Close the app and reopen it.\n4. If the order still does not appear, do NOT submit it again — contact your Admin first to avoid duplicates.`,
    },
    {
        category: 'Orders & Payments',
        q: 'Payment was collected but the due amount did not reduce',
        a: `1. Make sure the client name in the payment matches exactly with the client name in the due record.\n2. Check if the payment was saved successfully (it should appear in the Payment Collections list).\n3. If names are slightly different (e.g. "City Hospital" vs "City Hosp."), the system cannot match them — ask your Admin to manually adjust.\n4. Pull down to refresh the dues list after a few seconds.`,
    },
    {
        category: 'Orders & Payments',
        q: 'How do I check my payment collection history?',
        a: `1. Go to "Collect Payment" under Sales Analysis.\n2. The list shows all payments recorded.\n3. Admins and Accountants can see all payments across the team.\n4. Filter by date or client name to find specific records.`,
    },
    {
        category: 'Automation',
        q: 'WhatsApp / Email message was not sent to the customer',
        a: `1. Go to Admin → Settings → Automation Settings and check that WhatsApp / Email is turned ON.\n2. Verify the API key is entered correctly and saved.\n3. Make sure the customer's mobile number is correct (10 digits).\n4. Check the "Outbound Messages" log for status.\n5. If still failing, contact support.`,
    },
    {
        category: 'Automation',
        q: 'Customer is receiving duplicate WhatsApp messages',
        a: `1. Check the Orders or Payment list for duplicate entries — duplicate messages happen when the same entry is saved more than once.\n2. If duplicates exist, ask your Admin to delete the extra entry.\n3. Make sure the Submit button is not being tapped multiple times.`,
    },
    {
        category: 'Automation',
        q: 'I do not want to send WhatsApp messages for a specific entry',
        a: `1. Make sure the client's mobile number field is left blank — messages are only sent if a number is present.\n2. Alternatively, ask your Admin to temporarily turn off automation from Automation Settings, add the entry, then turn it back on.`,
    },
    {
        category: 'Subscription',
        q: 'My plan is expiring soon — how do I renew?',
        a: `1. Contact your Super Admin or support team via WhatsApp / phone.\n2. Make the payment as instructed.\n3. Your plan will be activated within 1 hour of payment confirmation.\n\nDo not wait until the last day — renew at least 2–3 days before expiry.`,
    },
    {
        category: 'Subscription',
        q: 'I am getting a "Plan Expired" message on login',
        a: `Your subscription has expired. You cannot login until it is renewed.\n\n1. Contact the Super Admin or support team immediately.\n2. Share your company name and registered email.\n3. Once renewed by the admin, you can login normally.\n\nAll your data is safe — nothing is deleted on expiry.`,
    },
    {
        category: 'Subscription',
        q: 'I made a payment but the plan is still not activated',
        a: `1. Make sure you tapped "I Have Paid" after scanning the QR code — this sends a notification to the admin.\n2. Share your payment screenshot on WhatsApp with the support team.\n3. Activation usually happens within 1 hour during business hours.\n4. If it has been more than 2 hours, contact support directly.`,
    },
    {
        category: 'Subscription',
        q: 'Can I add more employees without changing my plan?',
        a: `1. The number of employees allowed depends on your current plan's "Max Employees" limit.\n2. If you need more users, contact the Super Admin to increase your employee limit.\n3. The limit can be increased without changing the entire plan — a small upgrade fee may apply.\n4. Until the limit is increased, new employee accounts cannot be created.`,
    },
    {
        category: 'Users & Access',
        q: 'How do I add a new employee to the app?',
        a: `1. Go to Sidebar → Admin Control → Users tab.\n2. Tap the "+" icon at the top right.\n3. Fill in Name, Email ID, Password, Mobile Number, and Role.\n4. Tap Save — the account is created.\n5. The employee downloads the app from Google Play Store and logs in using the email and password you set.\n\nNote: Each employee must have a unique email ID.`,
    },
    {
        category: 'Users & Access',
        q: 'How do I change an employee\'s role, target, or leave balance?',
        a: `1. Go to Sidebar → Admin Control → Users tab.\n2. Tap on the employee you want to edit.\n3. Change their Role, Monthly Sales Target, Leave Balance, or any other detail.\n4. Tap Save — changes take effect immediately.\n5. The employee may need to close and reopen the app to see the updated role/permissions.`,
    },
    {
        category: 'Users & Access',
        q: 'I forgot my password — how do I reset it?',
        a: `Option 1: On the Login screen, tap "Forgot Password" and enter your registered email. A reset link will be sent.\n\nOption 2: Ask your company Admin to go to Admin Control → Users → select your profile → change password.\n\nNote: Check your spam/junk folder if you don't receive the reset email within 2 minutes.`,
    },
    {
        category: 'Users & Access',
        q: 'An employee left the company — how do I disable their access?',
        a: `1. Go to Sidebar → Admin Control → Users tab.\n2. Tap on the employee's profile.\n3. Toggle their status to "Inactive" or disable their account.\n4. Their login is blocked immediately.\n5. Their past records are retained for your reference — nothing is deleted.`,
    },
    {
        category: 'Users & Access',
        q: 'An employee cannot see a certain screen or feature',
        a: `1. Go to Sidebar → Admin Control → Permissions tab.\n2. Select the employee's role.\n3. Enable the module/feature you want them to see.\n4. The employee needs to close and reopen the app for changes to take effect.\n\nIf the feature is still not visible, contact your Super Admin — some features are restricted at the plan level.`,
    },
    {
        category: 'Admin Tools',
        q: 'How do I see the complete history of a client or machine?',
        a: `1. Go to Sidebar → "Serial Number".\n2. To search by machine: enter the Serial Number in the search bar — all installation, service, and PMS history appears.\n3. To search by client: tap the "Organization" tab, then type the hospital or company name.\n4. All records linked to that client — orders, payments, installations, service calls, PMS — are shown in one place.`,
    },
    {
        category: 'Admin Tools',
        q: 'How do I check what a specific employee did on a particular day?',
        a: `1. Go to Sidebar → "Activity Timeline".\n2. Select the employee from the list.\n3. A complete timeline of their activities appears — visits, orders, payments, installations, service calls, attendance — sorted by date.\n4. Use the date filter to check activity for a specific day or date range.`,
    },
    {
        category: 'Admin Tools',
        q: 'How do I see all employees\' sales performance in one place?',
        a: `1. Go to Sidebar → "Sales Calculation".\n2. Shows every employee's Orders, Sales Target, Achievement %, Payment Collections, and Pending Dues.\n3. Tap on any employee to drill into their individual data.\n4. Filter by month to see monthly performance trends.\n\nYou can also go to Live Dashboard → Sales Analysis from the home screen for a quick visual overview.`,
    },
    {
        category: 'Admin Tools',
        q: 'How do I control what each employee or team can see in the app?',
        a: `1. Go to Sidebar → Admin Control → Permissions tab.\n2. Select a role (Sales Executive, Service Engineer, Accountant, Store Keeper, etc.).\n3. Toggle any module ON or OFF.\n4. You can also set permissions for individual employees — user-specific settings override role settings.\n5. Employees need to close and reopen the app for changes to take effect.`,
    },
    {
        category: 'Admin Tools',
        q: 'How do I see all service history for a specific machine?',
        a: `Two ways:\n\n1. Go to Sidebar → Serial Number → enter the machine's Serial Number — all service, installation, and PMS records appear.\n\n2. Go to Activity Report → Service Analysis → search by machine model or serial number to see all tickets, their status, and resolution details.`,
    },
    {
        category: 'General',
        q: 'The app is running slow or crashing',
        a: `1. Close all background apps to free up RAM.\n2. Clear app cache: Settings → Apps → [App Name] → Clear Cache.\n3. Make sure your phone has at least 1 GB of free storage.\n4. Update the app from the Play Store.\n5. Restart your phone and try again.\n\nIf crashes continue, note what action causes it and contact support with your phone model and Android version.`,
    },
    {
        category: 'General',
        q: 'How do I update the app to the latest version?',
        a: `1. Open the Google Play Store.\n2. Search for the app name.\n3. If an "Update" button is visible, tap it.\n4. Wait for installation to complete.\n\nNo data is lost during updates.`,
    },
    {
        category: 'General',
        q: 'I accidentally deleted a record — can it be recovered?',
        a: `Records deleted from the app are permanently removed and cannot be recovered from the app itself.\n\nIf deleted recently:\n1. Contact support immediately with the details (client name, date, type of record).\n2. We may be able to recover it from database backups.\n\nTo avoid accidental deletions, only Admins should have delete permissions — set this in Admin Control → Permissions.`,
    },
    {
        category: 'General',
        q: 'Can I use the app on multiple phones at the same time?',
        a: `Yes, the same account can be logged in on multiple devices simultaneously.\n\nHowever:\n1. Attendance marking should be done from one device only to avoid location conflicts.\n2. Each employee should have their own login — sharing accounts causes mixed records.\n3. Contact your Admin if you need a separate account.`,
    },
    {
        category: 'General',
        q: 'The date or time on my records is wrong',
        a: `Records use your phone's date and time at the moment of saving.\n\n1. Go to Settings → Date & Time → enable "Automatic Date & Time".\n2. Make sure your timezone is correct (Settings → Date & Time → Timezone).\n3. Restart the app after fixing.\n\nNote: Already saved records cannot have their timestamps changed.`,
    },
    {
        category: 'General',
        q: 'How do I search for a specific record quickly?',
        a: `Every list screen has a Search Bar at the top.\n\n1. Type the client name, amount, date, or any keyword — results filter in real time.\n2. For a client's full history: Sidebar → Serial Number → Organization tab.\n3. For employee activity: Sidebar → Activity Timeline.\n4. For financial summary: Sidebar → Sales Calculation.`,
    },
];

const groupedFaqs = FAQS.reduce((acc: Record<string, typeof FAQS>, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
}, {});

const CATEGORY_ICONS: Record<string, any> = {
    Attendance: 'calendar',
    Connectivity: 'wifi',
    'Company Profile & PDFs': 'business',
    'Reports & PDFs': 'document-text',
    'Orders & Payments': 'cash',
    Automation: 'chatbubbles',
    Subscription: 'card',
    'Users & Access': 'people',
    'Admin Tools': 'shield',
    General: 'settings',
};

type TabKey = 'contact' | 'guide' | 'faq';

export default function HelpSupportScreen() {
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<TabKey>('contact');
    const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
    const [openCategory, setOpenCategory] = useState<string | null>('Attendance');
    const [expandedGuide, setExpandedGuide] = useState<number | null>(null);
    const [supportConfig, setSupportConfig] = useState(DEFAULTS);
    const [loadingConfig, setLoadingConfig] = useState(true);

    useEffect(() => {
        loadSupportConfig();
    }, []);

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

    const openWhatsApp = () => Linking.openURL(`https://wa.me/${supportConfig.supportPhone}`);
    const openCall = () => Linking.openURL(`tel:+${supportConfig.supportPhone}`);
    const openEmail = () => Linking.openURL(`mailto:${supportConfig.supportEmail}`);
    const openManual = () => Linking.openURL(supportConfig.userManualUrl);
    const openVideo = () => Linking.openURL(supportConfig.videoTutorialUrl);

    const toggleFaq = (key: string) => setExpandedFaq(prev => prev === key ? null : key);
    const toggleCategory = (cat: string) => { setOpenCategory(prev => prev === cat ? null : cat); setExpandedFaq(null); };

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
            <View style={styles.header}>
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

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

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
                                <Text style={styles.guideTitle}>User Manual (PDF)</Text>
                                <Text style={styles.guideSubtitle}>Step-by-step guide to using the app</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color="#ccc" />
                        </TouchableOpacity>

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
                        {GUIDE_SECTIONS.map((section, index) => {
                            const isOpen = expandedGuide === index;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.guideCardFull, isOpen && styles.guideCardFullOpen]}
                                    onPress={() => setExpandedGuide(isOpen ? null : index)}
                                    activeOpacity={0.85}
                                >
                                    <View style={styles.guideCardHeader}>
                                        <View style={[styles.guideIconBoxColored, { backgroundColor: section.color }]}>
                                            <Ionicons name={section.icon as any} size={18} color="white" />
                                        </View>
                                        <Text style={styles.guideCardTitle}>{section.title}</Text>
                                        <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#aaa" />
                                    </View>

                                    {isOpen && (
                                        <View style={styles.stepsBox}>
                                            {section.steps.map((step, stepIndex) => (
                                                <View key={stepIndex} style={styles.stepRow}>
                                                    <View style={[styles.stepNum, { backgroundColor: section.color }]}>
                                                        <Text style={styles.stepNumText}>{stepIndex + 1}</Text>
                                                    </View>
                                                    <Text style={styles.stepText}>{step}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </TouchableOpacity>
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
                            Browse common questions by category. Tap to expand.
                        </Text>
                        {Object.entries(groupedFaqs).map(([category, items]) => {
                            const isCatOpen = openCategory === category;
                            return (
                                <View key={category} style={styles.categoryBlock}>
                                    <TouchableOpacity
                                        style={styles.categoryHeader}
                                        onPress={() => toggleCategory(category)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={styles.categoryLeft}>
                                            <View style={styles.categoryIconBox}>
                                                <Ionicons name={CATEGORY_ICONS[category] || 'help-circle'} size={16} color="#3b5998" />
                                            </View>
                                            <Text style={styles.categoryTitle}>{category}</Text>
                                            <View style={styles.categoryCount}>
                                                <Text style={styles.categoryCountText}>{items.length}</Text>
                                            </View>
                                        </View>
                                        <Ionicons name={isCatOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#3b5998" />
                                    </TouchableOpacity>

                                    {isCatOpen && items.map((item, idx) => {
                                        const key = `${category}-${idx}`;
                                        const isOpen = expandedFaq === key;
                                        return (
                                            <TouchableOpacity
                                                key={key}
                                                style={[styles.faqCard, isOpen && styles.faqCardOpen]}
                                                onPress={() => toggleFaq(key)}
                                                activeOpacity={0.85}
                                            >
                                                <View style={styles.faqHeader}>
                                                    <Text style={[styles.faqQuestion, isOpen && { color: '#3b5998' }]}>
                                                        {item.q}
                                                    </Text>
                                                    <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={14} color={isOpen ? '#3b5998' : '#aaa'} />
                                                </View>
                                                {isOpen && (
                                                    <View style={styles.answerBox}>
                                                        <Text style={styles.faqAnswer}>{item.a}</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            );
                        })}
                        <Text style={styles.footerNote}>
                            Didn't find your answer?{'\n'}Go to the Contact tab to reach us directly.
                        </Text>
                    </>
                )}

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
        paddingTop: 50,
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
