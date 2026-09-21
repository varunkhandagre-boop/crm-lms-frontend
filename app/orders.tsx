import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { urlToBase64Image } from '../utils/pdfImageHelper';

// 🔥 SAAS IMPORTS (payments/users still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { listPaymentCollections } from '../services/api/paymentCollections';
import { fetchTeamMembers } from '../services/api/users';
import { useData } from './context/DataContext';
// 🔥 Cache-first list loading (see hooks/useCachedList.ts)
import { useCachedList } from '../hooks/useCachedList';
import { buildCacheKey } from '../utils/listCache';
// 🔥 Phase 3: orders now go through the new backend API
import {
    billOrder as apiBillOrder,
    deleteOrder as apiDeleteOrder,
    updateOrder as apiUpdateOrder,
    updateOrderStatus as apiUpdateOrderStatus,
    listOrders,
} from '../services/api/orders';

export default function OrderListScreen() {
  const router = useRouter();

  const { currentUser, addNotification, companyProfile } = useData();

  // 🔥 SaaS Engine kept only for isDbLoading (search-icon spinner); orders/payments/users no longer go through this
  const { isDbLoading } = useSaaSDB();

  // orderList now comes from useCachedList below (cache-first)
  const [paymentList, setPaymentList] = useState<any[]>([]);
  const [employees, setEmployees] = useState<{id: string, name: string}[]>([]);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'Day' | 'Month' | 'FY' | 'All'>('FY');
  const [currentDate, setCurrentDate] = useState(new Date());

  const [selectedEmployee, setSelectedEmployee] = useState('All'); 
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('All Staff');
  const [showEmployeePicker, setShowEmployeePicker] = useState(false);

  const [visibleCount, setVisibleCount] = useState(20);

  const [modalVisible, setModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [billedModalVisible, setBilledModalVisible] = useState(false);
  const [billingData, setBillingData] = useState({ finalAmount: '', paymentMode: 'Credit' });
  const [isBilling, setIsBilling] = useState(false);
  
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const userRole = (currentUser?.role || '').toLowerCase().trim();
  const isAdmin = ['admin', 'manager', 'account', 'accountant', 'hr', 'superadmin'].includes(userRole);
  const isStrictAdmin = ['admin', 'manager', 'accountant', 'account', 'superadmin'].includes(userRole); 

  useEffect(() => {
      if (viewMode === 'Day') setVisibleCount(500); 
      else setVisibleCount(20); 
  }, [viewMode, currentDate, searchText, statusFilter, selectedEmployee]);

  // 🔥 ORDERS — cache-first (instant from AsyncStorage, then background
  // refresh from the API). See hooks/useCachedList.ts.
  const ordersCacheKey = buildCacheKey('orders', currentUser?.companyId);
  const {
      data: orderList,
      setData: setOrderList,
      loading: ordersLoading,
      refreshing: ordersRefreshing,
      refresh: refreshOrders,
  } = useCachedList({
      cacheKey: ordersCacheKey,
      enabled: !!currentUser?.companyId,
      fetcher: listOrders, // was: fetchSaaSData("orders")
  });

  // 🔥 Team members — cache-first, shares the SAME 'team_members' cache key
  // as manage_team.tsx/employee_timeline.tsx.
  const { data: teamMembersForOrders } = useCachedList({
      cacheKey: buildCacheKey('team_members', currentUser?.companyId),
      enabled: !!currentUser?.companyId,
      fetcher: fetchTeamMembers,
  });
  useEffect(() => {
      if (isAdmin) {
          const mappedUsers = teamMembersForOrders.map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown User'
          }));
          setEmployees([{ id: 'All', name: 'All Staff' }, ...mappedUsers]);
      }
  }, [teamMembersForOrders, isAdmin]);

  // 🔥 senderName/bookedBy were never populated anywhere — the API only
  // ever returns senderId/createdById (see services/api/orders.ts's
  // comment), so every order showed "Unknown" regardless of caching. Fill
  // both in once team members are available: senderName from senderId,
  // and bookedBy from createdById (only when it's someone different from
  // senderId — an admin booking on another salesperson's behalf).
  useEffect(() => {
      if (teamMembersForOrders.length === 0 || orderList.length === 0) return;
      const nameById = new Map(teamMembersForOrders.map((u: any) => [u.id, u.name || 'Unknown']));
      const needsEnrichment = orderList.some((o: any) => o.senderName === undefined);
      if (!needsEnrichment) return;
      setOrderList(orderList.map((o: any) => ({
          ...o,
          senderName: nameById.get(o.senderId) || 'Unknown',
          bookedBy: o.createdById && o.createdById !== o.senderId
              ? (nameById.get(o.createdById) || undefined)
              : undefined,
      })));
  }, [orderList, teamMembersForOrders]);

  // Payments — unchanged plain fetch-on-mount (payments list is currently
  // unused downstream; left as-is, out of scope for this pass).
  useEffect(() => {
      const loadRest = async () => {
          if (currentUser?.companyId) {
              const payments = await listPaymentCollections(); // was: fetchSaaSData("payments")
              setPaymentList(payments);
          }
      };
      loadRest();
  }, [currentUser]);

  const parseDate = (dateStr: any) => {
      if (!dateStr) return 0;
      if (typeof dateStr === 'number') return dateStr; 
      if (dateStr instanceof Date) return dateStr.getTime(); 

      if (typeof dateStr === 'string') {
          let cleanStr = dateStr.replace(/\./g, '/').replace(/-/g, '/');
          const parts = cleanStr.split('/');
          
          if (parts.length === 3 && parts[0].length === 4) {
              const year = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1; 
              const day = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
          if (parts.length === 3 && parts[2].length === 4) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]) - 1;
              const year = parseInt(parts[2]);
              return new Date(year, month, day).getTime();
          }
      }
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  const changeDate = (dir: number) => {
      const d = new Date(currentDate);
      if (viewMode === 'Day') d.setDate(d.getDate() + dir);
      else if (viewMode === 'Month') d.setMonth(d.getMonth() + dir);
      else if (viewMode === 'FY') d.setFullYear(d.getFullYear() + dir);
      setCurrentDate(d);
  };

  const getHeaderDate = () => {
      if (viewMode === 'Day') return currentDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
      if (viewMode === 'Month') return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      if (viewMode === 'FY') {
          const currentMonth = currentDate.getMonth(); 
          const currentYear = currentDate.getFullYear();
          const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
          const fyEndYear = fyStartYear + 1;
          return `FY ${fyStartYear.toString().slice(-2)}-${fyEndYear.toString().slice(-2)}`;
      }
      return "All Time";
  };

  const generateOrderPDF = async (orderData: any) => {
    setGeneratingPdf(true);
    try {
                const logoBase64 = await urlToBase64Image(companyProfile?.logoUrl);
        const signatureBase64 = await urlToBase64Image(companyProfile?.signatureUrl);

        const logoHTML = logoBase64 
            ? `<img src="${logoBase64}" style="height: 60px; margin-bottom: 10px;" />` 
            : `<div class="title" style="font-size:24px;">${companyProfile?.companyName || 'MY COMPANY'}</div>`;

        const signatureHTML = signatureBase64 
            ? `<img src="${signatureBase64}" style="max-height: 60px; max-width: 150px;" />` 
            : `<div style="font-weight: bold; margin-top: 30px;">Authorized Signatory</div>`;

        const companyBankHTML = companyProfile?.bankDetails1?.accountNo 
            ? `<div style="margin-top: 20px; font-size: 10px; border: 1px dashed #ccc; padding: 10px; background:#f5f5f5;">
                <b>Our Bank Details:</b> ${companyProfile.bankDetails1.bankName} | 
                A/C: ${companyProfile.bankDetails1.accountNo} | 
                IFSC: ${companyProfile.bankDetails1.ifsc}
               </div>` 
            : '';

        const formattedProducts = orderData.productDetails ? orderData.productDetails.replace(/,|\n/g, '<br>• ') : '';

        const htmlContent = `
        <html>
        <head>
            <style>
                body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #333; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3b5998; padding-bottom: 10px; }
                .company-name { font-size: 24px; font-weight: bold; color: #3b5998; text-transform: uppercase; }
                .details-container { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .box { width: 48%; padding: 10px; border: 1px solid #eee; border-radius: 5px; background: #f9f9f9; }
                .box-title { font-size: 12px; color: #888; margin-bottom: 5px; text-transform: uppercase; }
                table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                th { background-color: #e3f2fd; color: #1565c0; font-weight: bold; padding: 10px; text-align: left; font-size: 12px; border: 1px solid #bbdefb; }
                td { padding: 10px; border: 1px solid #ddd; font-size: 13px; vertical-align: top; }
                .summary { border: 1px solid #ddd; border-radius: 5px; width: 40%; float: right; margin-bottom: 20px;}
                .summary-row { display: flex; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 13px; }
                .summary-row.total { background-color: #e3f2fd; font-weight: bold; font-size: 16px; border-bottom: none; color: #1565c0; }
            </style>
        </head>
        <body>
            <div class="header">
                <div style="flex: 1;">
                    <div class="company-name" style="margin-top: 0;">${companyProfile?.companyName || 'Our Company'}</div>
                    <div style="font-size: 12px; margin-top: 5px; max-width: 280px; line-height: 1.5;">${companyProfile?.address || companyProfile?.addressLine || ''}</div>
                    <div style="font-size: 12px; margin-top: 4px;">Phone: ${companyProfile?.contactPhone || '-'} | Email: ${companyProfile?.contactEmail || '-'}</div>
                                        ${companyProfile?.gstNumber ? `<div style="font-size: 12px; font-weight: bold; margin-top: 5px;">GSTIN: ${companyProfile.gstNumber}</div>` : ''}
                </div>
                <div style="width: 250px; text-align: right; margin-top: 0; padding-top: 0;">
                    ${companyProfile?.logoUrl ? `<img src="${companyProfile.logoUrl}" style="max-height: 120px; max-width: 240px; object-fit: contain; object-position: top; display: block; margin-left: auto;" />` : ''}
                </div>
            </div>

            <div style="text-align: center; margin: 15px 0;">
                <h2 style="margin:0; font-size: 22px; color: #1565c0; text-decoration: underline;">SALES ORDER</h2>
            </div>

            <div class="details-container">
                <div class="box">
                    <div class="box-title">Client Details</div>
                    <div style="font-weight: bold; font-size: 16px; color: #1565c0;">${orderData.hospitalName}</div>
                    <div style="font-size: 12px; margin-top: 5px;">${orderData.address || ''}, ${orderData.city || ''}</div>
                    <div style="font-size: 12px;">Contact: ${orderData.contactPerson || ''} (${orderData.mobile || ''})</div>
                </div>
                                <div style="text-align: right; font-size: 13px; line-height: 1.8;">
                    <div><strong>Order ID:</strong> ${orderData.orderId}</div>
                    <div><strong>Date:</strong> ${new Date(orderData.date).toLocaleDateString('en-GB')}</div>
                    <div><strong>PO Number:</strong> ${orderData.poNumber}</div>
                    <div style="margin-top: 5px; display: inline-block; padding: 4px 8px; background-color: ${(orderData.status === 'Completed' || orderData.status === 'Billed') ? '#e8f5e9' : orderData.status === 'Dispatched' ? '#e3f2fd' : '#fff3e0'}; border-radius: 4px; color: ${(orderData.status === 'Completed' || orderData.status === 'Billed') ? '#2e7d32' : orderData.status === 'Dispatched' ? '#1565c0' : '#e65100'}; font-weight: bold;">Status: ${orderData.status}</div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="70%">Product Configuration</th>
                        <th width="30%" style="text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            <strong>As per PO Details:</strong><br>
                            <span style="font-size: 11px; color: #555; white-space: pre-wrap; line-height: 1.6;">• ${formattedProducts}</span>
                        </td>
                        <td style="text-align:right; font-weight:bold; vertical-align: middle; font-size: 16px;">
                            ₹${Number(orderData.amount).toLocaleString('en-IN')}
                        </td>
                    </tr>
                </tbody>
            </table>

            <div class="summary">
                <div class="summary-row"><span>Total Order Value</span> <span>₹${Number(orderData.amount).toLocaleString('en-IN')}</span></div>
                ${orderData.advanceAmount && Number(orderData.advanceAmount) > 0 ? `<div class="summary-row" style="color: green;"><span>Advance Received</span> <span>- ₹${Number(orderData.advanceAmount).toLocaleString('en-IN')}</span></div>` : ''}
                <div class="summary-row total"><span>Balance Due</span> <span>₹${(Number(orderData.amount) - (Number(orderData.advanceAmount) || 0)).toLocaleString('en-IN')}</span></div>
            </div>

            <div style="clear: both;"></div>

            <div style="margin-top: 10px;">
                <div class="tc-title" style="color:#1565c0; font-size: 12px; font-weight: bold;">Order Terms:</div>
                <div style="margin-top: 5px; font-size: 11px;"><strong>Payment Terms:</strong> ${orderData.paymentTerms || 'As agreed'}</div>
                <div style="font-size: 11px;"><strong>Delivery Terms:</strong> ${orderData.deliveryTerms || 'As agreed'}</div>
                ${orderData.notes ? `<div style="font-size: 11px; margin-top: 5px;"><strong>Notes:</strong> ${orderData.notes}</div>` : ''}
            </div>

            ${companyBankHTML}

            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px;">
                <div style="font-size:10px; max-width:250px; color:#333;">
                    *This is a computer generated document.<br>
                    *Subject to Jurisdiction.
                </div>
                <div class="signature-box" style="text-align: center;">
                    <div style="font-weight:bold; margin-bottom: 5px; font-size: 12px;">For: ${companyProfile?.companyName || 'Our Company'}</div>
                    <div style="height: 60px; display:flex; align-items:center; justify-content:center;">
                        ${signatureHTML}
                    </div>
                    <div style="border-top: 1px solid #333; margin-top: 5px; padding-top: 5px; font-size: 11px; width: 150px;">Authorized Signatory<br><span style="font-size: 9px; color: gray;">(Booked By: ${orderData.senderName})</span></div>
                </div>
            </div>
        </body>
        </html>`;

        const { uri } = await Print.printToFileAsync({ html: htmlContent });
        const cleanName = `Order_${orderData.orderId}.pdf`;
        const newPath = `${FileSystem.cacheDirectory}${cleanName}`;

        try {
            await FileSystem.copyAsync({ from: uri, to: newPath });
            await Sharing.shareAsync(newPath, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: `Share Order PDF` });
        } catch (error) {
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        }
    } catch (error) {
        Alert.alert("Error", "Could not generate PDF");
    } finally {
        setGeneratingPdf(false);
    }
  };

  const handleOpenFile = async (url: string) => {
      if (!url) return;
      try {
          if (url.startsWith('http')) {
              Linking.openURL(url);
              return;
          }
          if (!(await Sharing.isAvailableAsync())) return;
          if (url.startsWith('file://') || url.startsWith('/')) {
              const cacheDir = (FileSystem as any).cacheDirectory;
              let extension = 'jpg'; 
              if (url.toLowerCase().includes('.pdf')) extension = 'pdf';
              else if (url.toLowerCase().includes('.png')) extension = 'png';
              const newPath = `${cacheDir}temp_share_${Date.now()}.${extension}`;

              try {
                  await FileSystem.copyAsync({ from: url, to: newPath });
                  await Sharing.shareAsync(newPath, { mimeType: extension === 'pdf' ? 'application/pdf' : 'image/jpeg' });
              } catch (copyError) {
                  await Sharing.shareAsync(url);
              }
          } 
      } catch (e: any) { Alert.alert("Error", "Could not open file."); }
  };

  const getFilteredData = () => {
      let data = orderList ? [...orderList] : [];

      if (isAdmin && selectedEmployee !== 'All') {
          const targetName = selectedEmployeeName.toLowerCase().trim();
          data = data.filter((item: any) => 
              (item.senderId === selectedEmployee) || 
              (item.userId === selectedEmployee) ||
              (item.senderName && item.senderName.toLowerCase().trim().includes(targetName)) ||
              (item.userName && item.userName.toLowerCase().trim().includes(targetName)) ||
              (item.bookedBy && item.bookedBy.toLowerCase().trim().includes(targetName))
          );
      } 
      else if (!isAdmin) {
          const myId = currentUser?.id || currentUser?.uid;
          data = data.filter((item: any) => item.senderId === myId || item.bookedBy === currentUser?.name);
      }

      if (statusFilter !== 'All') data = data.filter((item: any) => item.status === statusFilter);

      if (searchText) {
          const term = searchText.toLowerCase();
          data = data.filter((item: any) => {
              const fullString = `${item.hospitalName || ''} ${item.poNumber || ''} ${item.orderId || ''} ${item.productDetails || ''} ${item.amount || ''} ${item.status || ''} ${item.senderName || item.userName || ''} ${item.bookedBy || ''}`.toLowerCase();
              return fullString.includes(term);
          });
      }

      if (viewMode !== 'All') {
          const targetYear = currentDate.getFullYear();
          const targetMonth = currentDate.getMonth();
          const targetDay = currentDate.getDate();

          const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
          const fyStartDate = new Date(fyStartYear, 3, 1).getTime(); 
          const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

          data = data.filter((item: any) => {
              const ts = parseDate(item.dateIso || item.date || item.createdAt);
              if (ts === 0) return false;
              const itemDate = new Date(ts);
              
              if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
              if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
              if (viewMode === 'FY') return ts >= fyStartDate && ts <= fyEndDate;
              return true;
          });
      }

      data.sort((a: any, b: any) => {
          const aStatus = (a.status || '').toLowerCase().trim();
          const bStatus = (b.status || '').toLowerCase().trim();
          
          const aIsPriority = (aStatus === 'pending' || aStatus === 'approved') ? 1 : 0;
          const bIsPriority = (bStatus === 'pending' || bStatus === 'approved') ? 1 : 0;

          if (aIsPriority !== bIsPriority) {
              return bIsPriority - aIsPriority; 
          }
          return parseDate(b.dateIso || b.date) - parseDate(a.dateIso || a.date);
      });
      return data;
  };

  const fullList = getFilteredData(); 
  const renderedList = fullList.slice(0, visibleCount);

  // 🔥 STATUS UPDATE — via new backend API
  const handleUpdateStatus = async (newStatus: string) => {
      if (!selectedOrder) return;
      Alert.alert("Confirm", `Mark as ${newStatus}?`, [
          { text: "Cancel", style: "cancel" },
          { 
              text: "Yes", 
              onPress: async () => {
                  setIsUpdating(true);
                  try {
                      await apiUpdateOrderStatus(selectedOrder.id, newStatus as any);

                      if (addNotification && selectedOrder.senderId) {
                          await addNotification({
                              title: `Order ${newStatus}`, 
                              message: `Order for ${selectedOrder.hospitalName} (PO: ${selectedOrder.poNumber}) has been ${newStatus}.`,
                              type: newStatus === 'Approved' ? 'success' : newStatus === 'Rejected' ? 'alert' : 'info',
                              userId: selectedOrder.senderId,
                              to: selectedOrder.senderName, 
                              route: '/orders'
                          });
                      }
                      setOrderList(prev => prev.map(item => item.id === selectedOrder.id ? { ...item, status: newStatus } : item));
                      setModalVisible(false);
                  } catch (error: any) { Alert.alert("Error", error?.message || "Failed to update status."); } 
                  finally { setIsUpdating(false); }
              }
          }
      ]);
  };

  const openEditModal = (item: any) => {
      setEditData({
          id: item.id,
          hospitalName: item.hospitalName || '',
          poNumber: item.poNumber || '',
          amount: item.amount ? item.amount.toString() : '',
          productDetails: item.productDetails || '',
          paymentTerms: item.paymentTerms || '',
          deliveryTerms: item.deliveryTerms || '',
          notes: item.notes || '',
          saleType: item.saleType || 'Credit', 
          status: item.status || 'Pending'
      });
      setEditModalVisible(true);
  };

  // 🔥 ADMIN EDIT ORDER — via new backend API
  const handleSaveEdit = async () => {
      if (!editData.id) return;
      if (!editData.hospitalName || !editData.amount) {
          Alert.alert("Error", "Hospital Name and Amount are mandatory.");
          return;
      }
      setIsSavingEdit(true);
      try {
          const updates = {
              orgName: editData.hospitalName,
              poNumber: editData.poNumber,
              amount: parseFloat(editData.amount),
              productDetails: editData.productDetails,
              paymentTerms: editData.paymentTerms,
              deliveryTerms: editData.deliveryTerms,
              notes: editData.notes,
              saleType: editData.saleType,
          };
          await apiUpdateOrder(editData.id, updates);
          if (editData.status) await apiUpdateOrderStatus(editData.id, editData.status);

          setOrderList(prev => prev.map(item => item.id === editData.id ? { ...item, hospitalName: editData.hospitalName, ...updates, status: editData.status } : item));
          Alert.alert("Success", "Order details updated successfully!");
          setEditModalVisible(false);
      } catch (error: any) {
          Alert.alert("Error", error?.message || "Could not update order.");
      } finally {
          setIsSavingEdit(false);
      }
  };

  const openBillingModal = () => {
      setBillingData({ finalAmount: selectedOrder.amount.toString(), paymentMode: 'Credit' });
      setBilledModalVisible(true);
  };

  // 🔥 BILLING — via new backend API (server computes balance/status)
  const handleConfirmBilling = async () => {
      if (!billingData.finalAmount) return Alert.alert("Required", "Final bill amount is required.");
      setIsBilling(true);
      
      try {
          const finalAmountNum = parseFloat(String(billingData.finalAmount).replace(/[^0-9.]/g, '')) || 0;
          const updated = await apiBillOrder(selectedOrder.id, finalAmountNum);

          setOrderList(prev => prev.map(item => item.id === selectedOrder.id ? { ...item, ...updated } : item));
          Alert.alert("Success", `Billing Done! Auto-calculated balance: ₹${updated.balance}.`);
          setBilledModalVisible(false);
          setModalVisible(false); 
      } catch (error: any) {
          Alert.alert("Error", error?.message || "Failed to mark order as billed.");
      } finally {
          setIsBilling(false);
      }
  };

  // 🔥 DELETE — via new backend API
  const handleDeleteOrder = async () => {
      if (!selectedOrder) return;
      Alert.alert(
          "Delete Order?",
          "Are you sure you want to permanently delete this order?",
          [
              { text: "Cancel", style: "cancel" },
              { 
                  text: "Delete", 
                  style: "destructive", 
                  onPress: async () => {
                      setIsUpdating(true);
                      try {
                          await apiDeleteOrder(selectedOrder.id);
                          setOrderList(prev => prev.filter(item => item.id !== selectedOrder.id));
                          setModalVisible(false);
                          Alert.alert("Deleted", "Order has been deleted successfully.");
                      } catch (error: any) {
                          Alert.alert("Error", error.message);
                      } finally {
                          setIsUpdating(false);
                      }
                  } 
              }
          ]
      );
  };

  const renderProductList = (productsStr: string) => {
      if (!productsStr) return <Text style={{fontSize: 12, color: 'gray'}}>None</Text>;
      const productsArray = productsStr.split(/,|\n/).map(s => s.trim()).filter(Boolean); 
      return productsArray.map((prod, idx) => (
          <View key={idx} style={{flexDirection:'row', alignItems:'center', marginTop: 4}}>
              <Ionicons name="checkmark-circle-outline" size={14} color="#3b5998" />
              <Text style={{fontSize:13, color:'#444', marginLeft:6}}>{prod}</Text>
          </View>
      ));
  };

  const openDetails = (item: any) => {
      setSelectedOrder(item);
      setModalVisible(true);
  };

  const renderItem = ({ item }: any) => {
      const currentStatus = (item.status || '').trim(); 
      const lowerStatus = currentStatus.toLowerCase();

      const isApproved = currentStatus === 'Approved' || currentStatus === 'Dispatched';
      const isBilledOrCompleted = currentStatus === 'Billed' || currentStatus === 'Completed';
      const isRejected = currentStatus === 'Rejected';

      const isPendingOrApproved = lowerStatus === 'pending' || lowerStatus === 'approved';
      const showEditBtn = isStrictAdmin && isPendingOrApproved;

      const orderType = item.saleType || 'Credit';

      return (
        <TouchableOpacity style={[styles.card, isApproved && styles.cardApproved, isBilledOrCompleted && styles.cardBilled, isRejected && styles.cardRejected]} onPress={() => openDetails(item)}>
            <View style={styles.cardHeader}>
                <View style={{flex:1}}>
                    <View style={{flexDirection: 'row', alignItems: 'center'}}>
                        <Text style={styles.hospitalName} numberOfLines={1}>{item.hospitalName}</Text>
                        
                        {showEditBtn && (
                            <TouchableOpacity style={{marginLeft: 10, padding: 5}} onPress={() => openEditModal(item)}>
                                <Ionicons name="create" size={20} color="#d32f2f" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {item.city ? (
                        <Text style={{fontSize: 11, color: 'gray', marginBottom: 2}}>
                            <Ionicons name="location-outline" size={11} color="gray" /> {item.city}
                        </Text>
                    ) : null}
                    <Text style={styles.poNumber}>PO: {item.poNumber}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: isBilledOrCompleted ? '#e3f2fd' : isApproved ? '#e8f5e9' : (isRejected ? '#ffebee' : '#fff3e0') }]}>
                    <Text style={{color: isBilledOrCompleted ? '#1976d2' : isApproved ? 'green' : (isRejected ? 'red' : 'orange'), fontWeight:'bold', fontSize:10}}>
                        {currentStatus}
                    </Text>
                </View>
            </View>

            <Text style={styles.productText} numberOfLines={1}>📦 {item.productDetails}</Text>

            <View style={styles.row}>
                <View>
                    <Text style={styles.amount}>₹ {item.amount}</Text>
                    {item.advanceAmount ? <Text style={{fontSize:10, color:'green', fontWeight:'bold'}}>Adv: ₹{item.advanceAmount}</Text> : null}
                </View>
                <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.date}>{item.date}</Text>
                    
                    <View style={{backgroundColor: orderType === 'Cash' ? '#e8f5e9' : '#e3f2fd', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4}}>
                        <Text style={{fontSize: 9, fontWeight: 'bold', color: orderType === 'Cash' ? '#2e7d32' : '#1565c0'}}>
                            {orderType === 'Cash' ? '💵 CASH SALE' : '📄 CREDIT SALE'}
                        </Text>
                    </View>
                </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.footer}>
                <View style={{flex: 1}}>
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="person" size={14} color="#3b5998" />
                        <Text style={{color:'#3b5998', fontWeight:'bold', fontSize:12, marginLeft:5}}>
                             {item.senderName || item.userName || 'Unknown'}
                        </Text>
                    </View>
                    {item.bookedBy && item.bookedBy !== item.senderName && (
                        <Text style={{fontSize: 10, color: 'gray', marginLeft: 20}}>
                            (Entry by: {item.bookedBy})
                        </Text>
                    )}
                </View>

                {item.poFileUri ? (
                    <View style={{flexDirection:'row', alignItems:'center'}}>
                        <Ionicons name="attach" size={16} color="gray" />
                        <Text style={{fontSize:10, color:'gray'}}>File</Text>
                    </View>
                ) : null}
            </View>
        </TouchableOpacity>
      );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color="#333" /></TouchableOpacity>
        <Text style={styles.headerTitle}>Order Bookings</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/add_order' as any)}>
            <Ionicons name="add" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View style={{backgroundColor:'white', paddingBottom:10, marginBottom:5}}>
          <View style={styles.tabContainer}>
              {['Day', 'Month', 'FY', 'All'].map((m) => (
                  <TouchableOpacity key={m} style={[styles.tab, viewMode === m && styles.activeTab]} onPress={() => setViewMode(m as any)}>
                      <Text style={[styles.tabText, viewMode === m && styles.activeTabText]}>{m}</Text>
                  </TouchableOpacity>
              ))}
          </View>

          {isStrictAdmin && (
            <View style={{paddingHorizontal: 15, marginBottom: 10}}>
               <TouchableOpacity style={styles.employeeFilterBtn} onPress={() => setShowEmployeePicker(true)}>
                   <Ionicons name="people" size={18} color="#2e7d32" />
                   <Text style={{fontSize:13, marginLeft:8, color:'#2e7d32', fontWeight:'600'}}>
                       {selectedEmployee === 'All' ? 'View All Staff' : selectedEmployeeName}
                   </Text>
                   <Ionicons name="chevron-down" size={16} color="#2e7d32" style={{marginLeft:'auto'}}/>
               </TouchableOpacity>
            </View>
          )}

          {viewMode !== 'All' && (
              <View style={styles.dateNav}>
                  <TouchableOpacity onPress={() => changeDate(-1)}><Ionicons name="chevron-back" size={24} color="#555" /></TouchableOpacity>
                  <Text style={styles.monthText}>{getHeaderDate()}</Text>
                  <TouchableOpacity onPress={() => changeDate(1)}><Ionicons name="chevron-forward" size={24} color="#555" /></TouchableOpacity>
              </View>
          )}

          <View style={styles.searchBar}>
              {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={20} color="gray" />}
              <TextInput style={styles.searchInput} placeholder="Search Hospital, PO, ID..." value={searchText} onChangeText={setSearchText} />
              {searchText.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchText('')}><Ionicons name="close-circle" size={18} color="gray" /></TouchableOpacity>
              )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingLeft:15, paddingVertical:10}}>
    {['All', 'Pending', 'Approved', 'Dispatched', 'Billed', 'Rejected'].map(s => {
        
        const chipData = (() => {
            let base = orderList ? [...orderList] : [];

            if (isAdmin && selectedEmployee !== 'All') {
                const targetName = selectedEmployeeName.toLowerCase().trim();
                base = base.filter((item: any) =>
                    item.senderId === selectedEmployee ||
                    item.userId === selectedEmployee ||
                    (item.senderName && item.senderName.toLowerCase().includes(targetName)) ||
                    (item.userName && item.userName.toLowerCase().includes(targetName))
                );
            } else if (!isAdmin) {
                const myId = currentUser?.id || currentUser?.uid;
                base = base.filter((item: any) =>
                    item.senderId === myId || item.bookedBy === currentUser?.name
                );
            }

            if (searchText) {
                const term = searchText.toLowerCase();
                base = base.filter((item: any) => {
                    const fullString = `${item.hospitalName || ''} ${item.poNumber || ''} ${item.orderId || ''} ${item.productDetails || ''} ${item.amount || ''}`.toLowerCase();
                    return fullString.includes(term);
                });
            }

            if (viewMode !== 'All') {
                const targetYear = currentDate.getFullYear();
                const targetMonth = currentDate.getMonth();
                const targetDay = currentDate.getDate();
                const fyStartYear = targetMonth >= 3 ? targetYear : targetYear - 1;
                const fyStartDate = new Date(fyStartYear, 3, 1).getTime();
                const fyEndDate = new Date(fyStartYear + 1, 2, 31, 23, 59, 59, 999).getTime();

                base = base.filter((item: any) => {
                    const ts = parseDate(item.dateIso || item.date || item.createdAt);
                    if (ts === 0) return false;
                    const itemDate = new Date(ts);
                    if (viewMode === 'Month') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth;
                    if (viewMode === 'Day') return itemDate.getFullYear() === targetYear && itemDate.getMonth() === targetMonth && itemDate.getDate() === targetDay;
                    if (viewMode === 'FY') return ts >= fyStartDate && ts <= fyEndDate;
                    return true;
                });
            }

            const filtered = s === 'All'
                ? base.filter((item: any) => {
                    const status = (item.status || '').toLowerCase();
                    return !status.includes('reject') && !status.includes('cancel');
                })
                : base.filter((item: any) => item.status === s);

            const count = filtered.length;
            const amount = filtered.reduce((sum: number, o: any) => sum + (parseFloat(o.amount) || 0), 0);
            return { count, amount };
        })();

        const isActive = statusFilter === s;

        return (
            <TouchableOpacity
                key={s}
                style={[
                    styles.filterChip,
                    isActive && styles.activeChip,
                    { minWidth: 90, paddingVertical: 8, alignItems: 'center' }
                ]}
                onPress={() => setStatusFilter(s)}
            >
                <Text style={[styles.chipText, isActive && { color: 'white' }, { fontWeight: 'bold' }]}>
                    {s}
                </Text>
                <Text style={[
                    { fontSize: 11, marginTop: 2 },
                    isActive ? { color: 'white' } : { color: '#3b5998' }
                ]}>
                    {chipData.count} • ₹{chipData.amount >= 100000
                        ? (chipData.amount / 100000).toFixed(1) + 'L'
                        : chipData.amount.toLocaleString('en-IN')}
                </Text>
            </TouchableOpacity>
        );
    })}
</ScrollView>
      </View>

      <FlatList 
          data={renderedList}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{padding: 5, paddingBottom: 100}} 
          refreshControl={
              <RefreshControl refreshing={ordersRefreshing} onRefresh={refreshOrders} colors={['#3b5998']} tintColor="#3b5998" />
          }
          ListEmptyComponent={
              <View style={{alignItems:'center', marginTop:50}}>
                  {ordersLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{color:'gray'}}>No Orders Found</Text>}
              </View>
          }
          ListFooterComponent={
            <View style={{ paddingBottom: 80 }}>
                {visibleCount < fullList.length ? (
                    <TouchableOpacity onPress={() => setVisibleCount(prev => prev + 20)} style={styles.loadMoreBtn}>
                        <Text style={{fontWeight:'bold', color:'#3b5998'}}>👇 Load More Records ({fullList.length - visibleCount} remaining)</Text>
                    </TouchableOpacity>
                ) : (fullList.length > 0 ? <Text style={styles.endListText}>--- End of List ---</Text> : null)}
            </View>
        }
      />

      {/* ADMIN EDIT MODAL */}
      <Modal visible={editModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:15}}>
                      <Text style={styles.modalTitle}>Edit Order (Admin)</Text>
                      <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                          <Ionicons name="close-circle" size={28} color="#d32f2f" />
                      </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                      <Text style={styles.inputLabel}>Client / Hospital Name *</Text>
                      <TextInput style={styles.editInput} value={editData.hospitalName} onChangeText={t => setEditData({...editData, hospitalName: t})} />

                      <Text style={styles.inputLabel}>PO Number</Text>
                      <TextInput style={styles.editInput} value={editData.poNumber} onChangeText={t => setEditData({...editData, poNumber: t})} />

                      <Text style={styles.inputLabel}>Amount (₹) *</Text>
                      <TextInput style={styles.editInput} keyboardType="numeric" value={editData.amount} onChangeText={t => setEditData({...editData, amount: t})} />

                      <Text style={styles.inputLabel}>Order Type</Text>
                      <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                          <TouchableOpacity 
                              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: editData.saleType === 'Cash' ? '#2e7d32' : '#f0f0f0', alignItems: 'center' }} 
                              onPress={() => setEditData({...editData, saleType: 'Cash'})}
                          >
                              <Text style={{fontSize: 12, fontWeight: 'bold', color: editData.saleType === 'Cash' ? 'white' : '#555'}}>💵 Cash Sale</Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                              style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: (!editData.saleType || editData.saleType === 'Credit') ? '#1565c0' : '#f0f0f0', alignItems: 'center' }} 
                              onPress={() => setEditData({...editData, saleType: 'Credit'})}
                          >
                              <Text style={{fontSize: 12, fontWeight: 'bold', color: (!editData.saleType || editData.saleType === 'Credit') ? 'white' : '#555'}}>📄 Billed (Credit)</Text>
                          </TouchableOpacity>
                      </View>

                      <Text style={styles.inputLabel}>Status</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 10}}>
                          {['Pending', 'Approved', 'Rejected', 'Dispatched', 'Completed'].map(st => (
                              <TouchableOpacity 
                                  key={st} 
                                  style={[styles.statusChip, editData.status === st && {backgroundColor: '#3b5998', borderColor: '#3b5998'}]}
                                  onPress={() => setEditData({...editData, status: st})}
                              >
                                  <Text style={{color: editData.status === st ? 'white' : '#555', fontSize: 12}}>{st}</Text>
                              </TouchableOpacity>
                          ))}
                      </ScrollView>

                      <Text style={styles.inputLabel}>Product Details</Text>
                      <TextInput style={[styles.editInput, {height: 80, textAlignVertical: 'top'}]} multiline value={editData.productDetails} onChangeText={t => setEditData({...editData, productDetails: t})} />

                      <Text style={styles.inputLabel}>Payment Terms</Text>
                      <TextInput style={styles.editInput} value={editData.paymentTerms} onChangeText={t => setEditData({...editData, paymentTerms: t})} />

                      <Text style={styles.inputLabel}>Delivery Terms</Text>
                      <TextInput style={styles.editInput} value={editData.deliveryTerms} onChangeText={t => setEditData({...editData, deliveryTerms: t})} />

                      <Text style={styles.inputLabel}>Notes</Text>
                      <TextInput style={[styles.editInput, {height: 60, textAlignVertical: 'top'}]} multiline value={editData.notes} onChangeText={t => setEditData({...editData, notes: t})} />
                  </ScrollView>

                  <TouchableOpacity 
                      style={[styles.saveEditBtn, isSavingEdit && {opacity: 0.6}]} 
                      onPress={handleSaveEdit}
                      disabled={isSavingEdit}
                  >
                      {isSavingEdit ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Save Changes</Text>}
                  </TouchableOpacity>
              </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* BILLED MODAL */}
      <Modal visible={billedModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Complete Billing</Text>
                  <Text style={{color: 'gray', marginBottom: 15, fontSize: 12}}>Generate invoice and send it to Payment Dues.</Text>
                  
                  <Text style={styles.inputLabel}>Final Bill Amount (₹) *</Text>
                  <TextInput 
                      style={styles.editInput} 
                      keyboardType="numeric" 
                      value={billingData.finalAmount} 
                      onChangeText={t => setBillingData({...billingData, finalAmount: t})} 
                  />
                  <Text style={{fontSize: 10, color: 'green', marginTop: 2, marginBottom: 25}}>
                      Advance Already Received: ₹ {selectedOrder?.advanceAmount || 0}
                  </Text>

                  <View style={{flexDirection: 'row', gap: 10}}>
                      <TouchableOpacity style={[styles.saveEditBtn, {flex: 1, backgroundColor: 'gray', marginTop: 0}]} onPress={() => setBilledModalVisible(false)}>
                          <Text style={styles.btnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.saveEditBtn, {flex: 1, backgroundColor: '#2e7d32', marginTop: 0}]} onPress={handleConfirmBilling} disabled={isBilling}>
                          {isBilling ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Confirm Billing</Text>}
                      </TouchableOpacity>
                  </View>
              </View>
          </KeyboardAvoidingView>
      </Modal>

      {/* DETAILS MODAL */}
      <Modal visible={modalVisible} transparent={true} animationType="slide">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:10}}>
                      <Text style={styles.modalTitle}>Order Details</Text>
                      <TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close-circle" size={30} color="#d32f2f" /></TouchableOpacity>
                  </View>

                  {selectedOrder && (
                      <ScrollView showsVerticalScrollIndicator={false}>
                          <View style={styles.section}>
                              <Text style={styles.hospitalNameLarge}>{selectedOrder.hospitalName}</Text>
                              <Text style={{color:'gray', fontSize:12}}>{selectedOrder.address}, {selectedOrder.city}</Text>
                              <View style={styles.idRow}>
                                  <View style={styles.badge}><Text style={styles.badgeText}>ID: {selectedOrder.orderId || 'N/A'}</Text></View>
                                  <View style={[styles.badge, {backgroundColor:'#e3f2fd'}]}><Text style={[styles.badgeText, {color:'#1565c0'}]}>PO: {selectedOrder.poNumber}</Text></View>
                              </View>
                          </View>

                          <View style={styles.divider}/>

                          <Text style={styles.sectionHeader}>💼 Sales Team</Text>
                          <DetailRow label="Sales Person" value={selectedOrder.senderName} highlight />
                          {selectedOrder.bookedBy && selectedOrder.bookedBy !== selectedOrder.senderName && (
                              <DetailRow label="Entry By" value={selectedOrder.bookedBy} />
                          )}

                          <Text style={styles.sectionHeader}>👤 Client Contact</Text>
                          <DetailRow label="Name" value={selectedOrder.contactPerson} />
                          <DetailRow label="Mobile" value={selectedOrder.mobile} />
                          <DetailRow label="Email" value={selectedOrder.email} />

                          <Text style={styles.sectionHeader}>📦 Order Info</Text>
                          <DetailRow label="Order Type" value={selectedOrder.saleType === 'Cash' ? '💵 Cash Sale' : '📄 Billed (Credit)'} highlight />
                          <DetailRow label="Total Value" value={`₹ ${selectedOrder.amount}`} />
                          <DetailRow label="Advance Rcvd." value={selectedOrder.advanceAmount ? `₹ ${selectedOrder.advanceAmount}` : '0'} />
                          <DetailRow label="Date" value={selectedOrder.date} />
                          
                          <View style={styles.textBox}>
                              <Text style={styles.textLabel}>Products Config:</Text>
                              {renderProductList(selectedOrder.productDetails)}
                          </View>

                          <DetailRow label="Payment" value={selectedOrder.paymentTerms} />
                          <DetailRow label="Delivery" value={selectedOrder.deliveryTerms} />

                          {selectedOrder.notes ? (
                              <View style={styles.textBox}>
                                  <Text style={styles.textLabel}>Notes:</Text>
                                  <Text style={styles.textValue}>{selectedOrder.notes}</Text>
                              </View>
                          ) : null}

                          {selectedOrder.poFileUri && (
                              <TouchableOpacity style={styles.fileBox} onPress={() => handleOpenFile(selectedOrder.poFileUri)}>
                                  <Ionicons name="document-attach" size={20} color="#3b5998" />
                                  <Text style={{marginLeft:10, flex:1, color:'#3b5998', textDecorationLine:'underline'}}>
                                      {selectedOrder.poFileName || 'Download Attachment'}
                                  </Text>
                                  <Ionicons name="open-outline" size={16} color="green" />
                              </TouchableOpacity>
                          )}

                          <TouchableOpacity 
                              style={{flexDirection:'row', alignItems:'center', justifyContent:'center', backgroundColor:'#e3f2fd', padding:12, borderRadius:8, marginTop:20, borderWidth:1, borderColor:'#2196f3'}}
                              onPress={() => generateOrderPDF(selectedOrder)}
                              disabled={generatingPdf}
                          >
                              {generatingPdf ? (
                                <ActivityIndicator color="#1565c0" size="small" />
                              ) : (
                                <>
                                  <Ionicons name="document-text-outline" size={20} color="#1565c0" />
                                  <Text style={{color:'#1565c0', fontWeight:'bold', marginLeft:8}}>Share Order PDF</Text>
                                </>
                              )}
                          </TouchableOpacity>
                          
                          <View style={styles.divider}/>
                          <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center'}}>
                              <Text style={{color:'gray'}}>Status:</Text>
                              <Text style={{fontWeight:'bold', color:'#333', fontSize:16}}>{selectedOrder.status}</Text>
                          </View>

                          {isStrictAdmin && selectedOrder.status === 'Pending' && (
                              <View style={styles.actionRow}>
                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#d32f2f', opacity: isUpdating ? 0.6 : 1}]} onPress={() => handleUpdateStatus('Rejected')} disabled={isUpdating}>
                                      <Text style={styles.btnText}>Reject</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#2e7d32', opacity: isUpdating ? 0.6 : 1}]} onPress={() => handleUpdateStatus('Approved')} disabled={isUpdating}>
                                      {isUpdating ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Approve</Text>}
                                  </TouchableOpacity>
                              </View>
                          )}
                          
                          {isStrictAdmin && (selectedOrder.status === 'Approved' || selectedOrder.status === 'Dispatched') && (
                              <TouchableOpacity style={[styles.actionBtn, {backgroundColor:'#1976d2', marginTop:15}]} onPress={openBillingModal}>
                                  <Text style={styles.btnText}>✅ Mark as Billed (Generate Due)</Text>
                              </TouchableOpacity>
                          )}

                          {isStrictAdmin && (
                              <TouchableOpacity 
                                  style={{marginTop: 15, backgroundColor: '#ffebee', padding: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#ef9a9a'}} 
                                  onPress={handleDeleteOrder}
                                  disabled={isUpdating}
                              >
                                  <View style={{flexDirection:'row', alignItems:'center'}}>
                                      {isUpdating ? <ActivityIndicator size="small" color="#d32f2f" /> : <Ionicons name="trash-outline" size={18} color="#d32f2f" />}
                                      <Text style={{color: '#d32f2f', fontWeight: 'bold', marginLeft: 8}}>
                                          {isUpdating ? "Deleting..." : "Delete Order"}
                                      </Text>
                                  </View>
                              </TouchableOpacity>
                          )}
                      </ScrollView>
                  )}
              </View>
          </View>
      </Modal>

      <Modal visible={showEmployeePicker} transparent animationType="fade">
          <TouchableOpacity style={styles.pickerOverlay} onPress={() => setShowEmployeePicker(false)}>
              <View style={styles.pickerContainer}>
                  <Text style={styles.pickerHeader}>Select Employee View</Text>
                  <FlatList 
                    data={employees} 
                    keyExtractor={item => item.id} 
                    renderItem={({item}) => (
                      <TouchableOpacity style={styles.pickerItem} onPress={() => { setSelectedEmployee(item.id); setSelectedEmployeeName(item.name); setShowEmployeePicker(false); }}>
                          <View style={{flexDirection:'row', alignItems:'center'}}>
                             <Ionicons name="person-circle" size={24} color="#555" style={{marginRight:10}}/>
                             <Text style={{fontSize:16, color:'#333'}}>{item.name}</Text>
                          </View>
                          {selectedEmployee === item.id && <Ionicons name="checkmark" size={18} color="green" />}
                      </TouchableOpacity>
                  )} />
              </View>
          </TouchableOpacity>
      </Modal>

    </View>
  );
}

const DetailRow = ({label, value, icon, highlight}: any) => (
    <View style={{flexDirection:'row', alignItems:'center', marginBottom:10}}>
        {icon && <View style={{width:30}}><Ionicons name={icon} size={20} color="#3b5998" /></View>}
        <View style={{flex: 1, flexDirection:'row', justifyContent: 'space-between', paddingRight: 10}}>
            <Text style={{fontSize:12, color:'gray'}}>{label}</Text>
            <Text style={{fontSize:14, fontWeight:'bold', color: highlight ? '#2e7d32' : '#333', maxWidth:'70%', textAlign:'right'}}>{value || '-'}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, paddingTop: 50, backgroundColor: 'white', elevation: 4, alignItems:'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  addBtn: { backgroundColor:'#3b5998', padding:8, borderRadius:20 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#e0e0e0', margin: 10, borderRadius: 8, padding: 2, marginBottom: 5 },
  tab: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 6 },
  activeTab: { backgroundColor: 'white', elevation: 2 },
  tabText: { color: 'gray', fontWeight: '600', fontSize: 12 },
  activeTabText: { color: '#3b5998', fontWeight: 'bold' },

  employeeFilterBtn: { flexDirection:'row', alignItems:'center', backgroundColor:'#e8f5e9', paddingHorizontal:12, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:'#2e7d32', marginBottom:10 },

  dateNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', padding: 6, marginHorizontal: 15, borderRadius: 8, marginBottom: 5, borderWidth:1, borderColor:'#eee' },
  monthText: { fontWeight: 'bold', color: '#3b5998', fontSize: 14 },

  searchBar: { flexDirection: 'row', backgroundColor: '#f0f0f0', marginHorizontal: 15, paddingHorizontal: 10, borderRadius: 8, height:36, alignItems:'center', marginBottom:10 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#333' },

  filterChip: { paddingHorizontal:15, paddingVertical:6, backgroundColor:'#eee', borderRadius:20, marginRight:10, minWidth: 90, alignItems: 'center' },
  activeChip: { backgroundColor:'#3b5998' },
  chipText: { fontSize:12, color:'#555' },
  
  card: { backgroundColor: 'white', borderRadius: 10, padding: 15, marginBottom: 10, elevation: 2, borderLeftWidth:4, borderLeftColor:'#ff9800' },
  cardApproved: { borderLeftColor: '#4caf50' },
  cardBilled: { borderLeftColor: '#1976d2' },
  cardRejected: { borderLeftColor: '#f44336' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  hospitalName: { fontWeight: 'bold', fontSize: 16, color: '#333', flex:1 },
  poNumber: { fontSize: 12, color: 'gray' },
  statusBadge: { paddingHorizontal:8, paddingVertical:3, borderRadius:4, marginLeft: 10 },
  productText: { fontSize: 13, color: '#555', marginTop: 8, fontStyle: 'italic' },
  row: { flexDirection:'row', justifyContent:'space-between', marginTop:10 },
  amount: { fontWeight:'bold', fontSize:16, color:'#333' },
  date: { color:'gray', fontSize:12 },
  divider: { height:1, backgroundColor:'#eee', marginVertical:10 },
  footer: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', padding: 10 },
  modalContent: { backgroundColor: 'white', borderRadius: 15, padding: 20, maxHeight:'85%', width:'100%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
  hospitalNameLarge: { fontSize:18, fontWeight:'bold', color:'#333' },
  sectionHeader: { fontSize:14, fontWeight:'bold', color:'#3b5998', marginTop:15, marginBottom:10, backgroundColor:'#e3f2fd', padding:5, borderRadius:5 },
  section: { marginBottom: 10 },
  idRow: { flexDirection:'row', gap:10, marginTop:5 },
  badge: { backgroundColor:'#eee', paddingHorizontal:8, paddingVertical:2, borderRadius:4 },
  badgeText: { fontSize:11, fontWeight:'bold', color:'#555' },
  textBox: { backgroundColor:'#f9f9f9', padding:10, borderRadius:8, marginBottom:10 },
  textLabel: { fontSize:11, color:'gray', marginBottom:2 },
  textValue: { fontSize:13, color:'#333' },
  
  fileBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#e0f7fa', padding:12, borderRadius:8, marginTop:5, borderWidth:1, borderColor:'#26c6da' },
  
  actionRow: { flexDirection:'row', justifyContent:'space-between', marginTop: 20, paddingBottom: 20 },
  actionBtn: { flex:0.48, padding:12, borderRadius:8, alignItems:'center', justifyContent:'center' },
  btnText: { color:'white', fontWeight:'bold' },

  inputLabel: { fontSize: 12, color: 'gray', marginTop: 10, marginBottom: 5, fontWeight: 'bold' },
  editInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, fontSize: 14, color: '#333', backgroundColor: '#f9f9f9' },
  saveEditBtn: { backgroundColor: '#d32f2f', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#ddd', marginRight: 10 },

  loadMoreBtn: { padding: 12, backgroundColor: '#fff', alignItems: 'center', marginVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  endListText: { textAlign: 'center', padding: 20, color: '#aaa', fontSize: 12, fontStyle: 'italic' },

  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  pickerContainer: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 15, maxHeight: 300, elevation:10 },
  pickerHeader: { fontWeight:'bold', fontSize:16, marginBottom:10, color:'#3b5998', textAlign:'center' },
  pickerItem: { paddingVertical:12, borderBottomWidth:1, borderBottomColor:'#eee', flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
});
