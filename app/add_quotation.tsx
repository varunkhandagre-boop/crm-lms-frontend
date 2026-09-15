import { Ionicons } from '@expo/vector-icons';
import * as Print from 'expo-print';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 🔥 SAAS IMPORTS (organizations/products still Firestore)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';
// 🔥 Phase 2: quotations now go through the new backend API
import { fetchOrganizations } from '../services/api/organizations';
import { listProducts } from '../services/api/products';
import { createQuotation, listQuotations, updateQuotation } from '../services/api/quotations';

export default function AddQuotationScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets(); 
    
    const { id, mode, leadOrg, leadPerson, leadMobile, leadCity, leadAddress, leadProduct } = useLocalSearchParams(); 
    const { companyProfile, currentUser, sendDynamicEmail, sendSystemWhatsApp } = useData();
    const { fetchSaaSData, isDbLoading } = useSaaSDB();

    const [orgList, setOrgList] = useState<any[]>([]);
    const [productList, setProductList] = useState<any[]>([]);
    const [quotationList, setQuotationList] = useState<any[]>([]); 

    const [selectedOrg, setSelectedOrg] = useState<any>(null);
    const [showOrgModal, setShowOrgModal] = useState(false);
    const [orgSearch, setOrgSearch] = useState(''); 

    const [items, setItems] = useState<any[]>([]);
    const [showProductModal, setShowProductModal] = useState(false);
    const [prodSearch, setProdSearch] = useState(''); 

    const [pdfTheme, setPdfTheme] = useState<'theme1' | 'theme2'>('theme1');
    const [taxType, setTaxType] = useState<'CGST/SGST' | 'IGST'>('CGST/SGST');

    const defaultTC = `1. Rate: Packing & assembly – Free of cost\n2. Transportation: Extra\n3. Taxes: extra as applicable\n4. Payment Terms: 100% advance along with Purchase Order\n5. Delivery: Within 10 days from the date of receipt of Purchase Order along with advance payment\n6. Validity: 30 days from the date of quotation\n7. Warranty: 1 years from the date of delivery\n8. TCS Provision: TCS will be collected if applicable as per Circular No. 17/2020. Prices quoted are exclusive of TCS.\n9. Order Cancellation: In case the Purchase Order is cancelled before dispatch, cancellation charges @5% will be applicable.\n10. Unloading & Shifting Charges: Included\n11. Order To Be Released In The Name Of: ${companyProfile?.companyName || 'Life Line Medical Systems'}.`;
    
    const [terms, setTerms] = useState(defaultTC); 
    const [docTitle, setDocTitle] = useState<'ESTIMATE' | 'PROFORMA INVOICE' | 'QUOTATION'>('ESTIMATE');
    const [isSaving, setIsSaving] = useState(false); 
    const [existingEstimateNo, setExistingEstimateNo] = useState(''); 

    useEffect(() => {
        const loadData = async () => {
            if (currentUser?.companyId) {
                const [orgs, prods, quotes] = await Promise.all([
                    fetchOrganizations({ limit: 200 }),
                    listProducts(), // was: fetchSaaSData("products")
                    listQuotations() // was: fetchSaaSData("quotations")
                ]);
                setOrgList(orgs);
                setProductList(prods);
                setQuotationList(quotes);
            }
        };
        loadData();
    }, [currentUser]);

    useEffect(() => {
        if (mode === 'from_lead') {
            setSelectedOrg({
                id: 'lead_temp_org',
                name: leadOrg || '',
                orgName: leadOrg || '',
                contactPerson: leadPerson || '',
                mobile: leadMobile || '',
                city: leadCity || '',
                address: leadAddress || ''
            });

            if (leadProduct) {
                setItems([{
                    id: Date.now().toString(),
                    name: leadProduct,
                    model: '',
                    specifications: '',
                    qty: 1,
                    price: 0,
                    gstRate: 18,
                    isCustom: true
                }]);
            }
            setTerms(defaultTC);
        } 
        else if (id && quotationList.length > 0) {
            const data = quotationList.find((q:any) => q.id === id);
            if (data) {
                setItems(data.items || []);
                setTerms(data.termsAndConditions || defaultTC);
                if (data.taxType) setTaxType(data.taxType);
                if (data.docTitle) setDocTitle(data.docTitle);
                
                const foundOrg = orgList.find((o:any) => o.id === data.orgId);
                if(foundOrg) setSelectedOrg(foundOrg);
                else setSelectedOrg({ id: data.orgId, name: data.orgName, address: data.orgAddress, phone: data.orgPhone });

                if (mode === 'edit') setExistingEstimateNo(data.estimateNo);
                else if (mode === 'duplicate') setSelectedOrg(null); 
            }
        } else {
            setTerms(defaultTC);
        }
    }, [id, mode, leadOrg, leadPerson, leadMobile, leadCity, leadAddress, leadProduct, orgList, quotationList, companyProfile]);

    const numberToWords = (num: number) => {
        const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
        const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if ((num = num.toString().replace(/[\, ]/g, '') as any) != parseFloat(num as any)) return 'Not a Number';
        let n: any = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return; let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'Crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'Lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'Thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'Hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) + 'only' : '';
        return str.trim();
    };

    const getFinancialYear = () => {
        const date = new Date();
        const year = date.getFullYear();
        const month = date.getMonth(); 
        return month >= 3 ? `${year}-${(year + 1).toString().slice(-2)}` : `${year - 1}-${year.toString().slice(-2)}`;
    };
    useEffect(() => {
    if (selectedOrg && companyProfile) {
        let compState = ((companyProfile as any).state || '').toLowerCase().trim();
        if (!compState) compState = 'maharashtra';

        let clientState = (selectedOrg.state || '').toLowerCase().trim();
        if (!clientState && selectedOrg.address?.toLowerCase().includes('maharashtra')) {
            clientState = 'maharashtra';
        }

        if (clientState) {
            if (compState === clientState) setTaxType('CGST/SGST');
            else setTaxType('IGST');
        }
    }
}, [selectedOrg, companyProfile]);

    const filteredOrgs = orgList.filter((o: any) => (o.name || o.orgName || '').toLowerCase().includes(orgSearch.toLowerCase()));
    
    const searchTxt = prodSearch.toLowerCase();
    const baseFilteredProds = productList.filter((p: any) => (p.name || p.model || '').toLowerCase().includes(searchTxt));
    const filteredProds = [
        ...baseFilteredProds, 
        { id: 'custom_other', name: 'Other (Type Manually)', model: '', price: 0, gstRate: 18 }
    ];

    const selectProduct = (prod: any) => {
        const isCustom = prod.id === 'custom_other';
        const newItem = {
            id: Date.now().toString(), 
            name: isCustom ? '' : prod.name, 
            model: isCustom ? '' : prod.model, 
            specifications: prod.specifications || '',
            qty: 1, 
            price: prod.price || 0, 
            gstRate: prod.gstRate || 18,
            isCustom: isCustom
        };
        setItems([...items, newItem]);
        setShowProductModal(false);
        setProdSearch('');
    };

    const updateItemField = (index: number, field: string, value: string) => {
        const newItems = [...items];
        if (field === 'specifications' || field === 'name' || field === 'model') {
            newItems[index][field] = value;
        } else {
            newItems[index][field] = Number(value);
        }
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    let subTotal = 0;
    let totalGST = 0;
    let totalQty = 0; 
    const gstBreakdown: { [key: number]: number } = {};

    items.forEach(item => {
        const itemBaseTotal = item.qty * item.price;
        const rate = Number(item.gstRate) || 0;
        const itemGSTAmount = (itemBaseTotal * rate) / 100;
        
        subTotal += itemBaseTotal;
        totalGST += itemGSTAmount;
        totalQty += Number(item.qty) || 0; 

        if (rate > 0) {
            if (!gstBreakdown[rate]) gstBreakdown[rate] = 0;
            gstBreakdown[rate] += itemGSTAmount;
        }
    });
    const grandTotal = subTotal + totalGST;

    const getQuotationHTML = (estimateNo: string) => {
        let gstHtmlRows = '';
        Object.keys(gstBreakdown).forEach((rateStr) => {
            const rate = Number(rateStr);
            const amount = gstBreakdown[rate];
            if (taxType === 'IGST') {
                gstHtmlRows += `<div class="summary-row"><span>IGST @ ${rate}%</span> <span>₹ ${amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>`;
            } else {
                const halfRate = rate / 2;
                const halfAmount = amount / 2;
                gstHtmlRows += `
                    <div class="summary-row"><span>CGST @ ${halfRate}%</span> <span>₹ ${halfAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                    <div class="summary-row"><span>SGST @ ${halfRate}%</span> <span>₹ ${halfAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                `;
            }
        });

        const headerHTML = pdfTheme === 'theme1' 
        ? `
            <div style="flex: 1; text-align: left;">
                <div class="company-name">${companyProfile?.companyName || 'Company Name'}</div>
                <div style="font-size: 12px; margin-top: 5px; max-width: 300px; line-height: 1.5;">${(companyProfile as any)?.fullAddress?.line ? `${(companyProfile as any).fullAddress.line}, ${(companyProfile as any).fullAddress.city || ''}, ${(companyProfile as any).fullAddress.state || ''} - ${(companyProfile as any).fullAddress.pincode || ''}` : (companyProfile?.address || 'Address Not Set')}</div>
                <div style="font-size: 12px; margin-top: 4px;">Phone: ${companyProfile?.phone || ''}</div>
                <div style="font-size: 12px; margin-top: 2px;">Email: ${companyProfile?.email || ''}</div>
                <div style="font-size: 12px; font-weight: bold; margin-top: 5px;">GSTIN: ${companyProfile?.gstNumber || 'N/A'}</div>
            </div>
            <div style="width: 200px; text-align: right;">
                ${(companyProfile as any)?.logoUrl ? `<img src="${(companyProfile as any).logoUrl}" style="max-height: 110px; max-width: 180px; object-fit: contain;" />` : ''}
            </div>
        ` 
        : `
            <div style="width: 200px; text-align: left;">
                ${(companyProfile as any)?.logoUrl ? `<img src="${(companyProfile as any).logoUrl}" style="max-height: 110px; max-width: 180px; object-fit: contain;" />` : ''}
            </div>
            <div style="flex: 1; display: flex; flex-direction: column; align-items: flex-end; text-align: right;">
                <div class="company-name">${companyProfile?.companyName || 'Company Name'}</div>
                <div style="font-size: 12px; margin-top: 5px; max-width: 300px; line-height: 1.5;">${(companyProfile as any)?.fullAddress?.line ? `${(companyProfile as any).fullAddress.line}, ${(companyProfile as any).fullAddress.city || ''}, ${(companyProfile as any).fullAddress.state || ''} - ${(companyProfile as any).fullAddress.pincode || ''}` : (companyProfile?.address || 'Address Not Set')}</div>
                <div style="font-size: 12px; margin-top: 4px;">Phone: ${companyProfile?.phone || ''}</div>
                <div style="font-size: 12px; margin-top: 2px;">Email: ${companyProfile?.email || ''}</div>
                <div style="font-size: 12px; font-weight: bold; margin-top: 5px;">GSTIN: ${companyProfile?.gstNumber || 'N/A'}</div>
            </div>
        `;

        return `
        <html>
        <head>
            <style>
                @page { size: A4; margin: 0; }
                body { 
                    font-family: 'Helvetica', 'Arial', sans-serif; 
                    margin: 0; 
                    padding: 20px; 
                    color: #333; 
                    display: flex; 
                    flex-direction: column; 
                    min-height: 100vh;
                    box-sizing: border-box;
                }
                .document-wrapper {
                    border: 1px solid #777;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid #777; padding: 15px; }
                .company-name { font-size: 22px; font-weight: bold; color: #1565c0; text-transform: uppercase; }
                
                .doc-title-row { text-align: center; border-bottom: 1px solid #777; background-color: #f8f9fa; padding: 6px; }
                .doc-title { margin:0; font-size: 16px; font-weight: bold; color: #333; letter-spacing: 2px; text-transform: uppercase; }
                
                .details-container { display: flex; justify-content: space-between; border-bottom: 1px solid #777; }
                .box-left { flex: 1; padding: 15px; border-right: 1px solid #777; }
                .box-right { width: 250px; padding: 15px; font-size: 12px; line-height: 1.8; }
                .box-title { font-size: 11px; color: #666; margin-bottom: 5px; text-transform: uppercase; }
                
                .main-content { flex: 1; display: flex; flex-direction: column; }
                table { width: 100%; border-collapse: collapse; flex: 1; display: table; table-layout: fixed; height: 100%; }
                th { 
                    background-color: #f0f4f8; 
                    color: #333; 
                    font-weight: bold; 
                    padding: 8px 10px; 
                    text-align: left; 
                    font-size: 12px; 
                    border-right: 1px solid #777; 
                    border-bottom: 1px solid #777;
                }
                th:last-child { border-right: none; }
                
                td { 
                    padding: 8px 10px; 
                    border-right: 1px solid #777; 
                    font-size: 13px; 
                    vertical-align: top; 
                    word-wrap: break-word;
                }
                td:last-child { border-right: none; }
                
                .spacer-row { height: 100%; }
                .spacer-row td { border-bottom: none; }

                .totals-row td {
                    border-top: 1px solid #777;
                    border-bottom: 1px solid #777;
                    font-weight: bold;
                    padding: 10px;
                    background-color: #f0f4f8; 
                    color: #1565c0;
                }

                .specs { font-size: 11px; color: #555; margin-top: 4px; white-space: pre-wrap; }
                
                .footer-content { display: flex; justify-content: space-between; border-top: 1px solid #777; margin-top: auto; page-break-inside: avoid; }
                .footer-left { flex: 1; padding: 15px; border-right: 1px solid #777; }
                .footer-right { width: 250px; padding: 0; display: flex; flex-direction: column; justify-content: space-between; }
                
                .summary-row { display: flex; justify-content: space-between; padding: 8px 15px; font-size: 12px; border-bottom: 1px solid #777; }
                .summary-row.total { font-weight: bold; font-size: 15px; background-color: #f0f4f8; color: #1565c0; margin-top: 0; border-bottom: 1px solid #777; }
            </style>
        </head>
        <body>
            <div class="document-wrapper">
                <div class="header">
                    ${headerHTML}
                </div>

                <div class="doc-title-row">
                    <h2 class="doc-title">${docTitle}</h2>
                </div>

                <div class="details-container">
                    <div class="box-left">
                        <div class="box-title">Billed To (Consignee)</div>
                        <div style="font-weight: bold; font-size: 14px; color: #333;">${selectedOrg?.name || selectedOrg?.orgName || ''}</div>
                        <div style="font-size: 12px; margin-top: 5px;">${selectedOrg?.address || selectedOrg?.city || 'Address Not Provided'}</div>
                        <div style="font-size: 12px; margin-top: 2px;">Phone: ${selectedOrg?.mobile || selectedOrg?.phone || 'N/A'}</div>
                    </div>
                    <div class="box-right">
                        <div><strong>Doc No:</strong> ${estimateNo}</div>
                        <div style="margin-top: 4px;"><strong>Date:</strong> ${new Date().toLocaleDateString('en-GB')}</div>
                        <div style="margin-top: 4px;"><strong>Valid Till:</strong> ${new Date(Date.now() + 15*24*60*60*1000).toLocaleDateString('en-GB')}</div>
                    </div>
                </div>

                <div class="main-content">
                    <table>
                        <thead>
                            <tr>
                                <th width="5%">#</th>
                                <th width="45%">Description of Goods</th>
                                <th width="8%" style="text-align:center;">Qty</th>
                                <th width="14%" style="text-align:right;">Rate</th>
                                <th width="12%" style="text-align:right;">GST</th>
                                <th width="16%" style="text-align:right;">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map((item, index) => {
                                const baseAmount = item.qty * item.price;
                                const gstAmount = (baseAmount * item.gstRate) / 100;
                                const rowTotal = baseAmount + gstAmount;
                                return `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>
                                        <strong>${item.name} ${item.model ? `(${item.model})` : ''}</strong>
                                        ${item.specifications ? `<div class="specs">${item.specifications}</div>` : ''}
                                    </td>
                                    <td style="text-align:center;">${item.qty}</td>
                                    <td style="text-align:right;">${item.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                    <td style="text-align:right;">${gstAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}<br><span style="font-size:9px; color:gray;">(${item.gstRate}%)</span></td>
                                    <td style="text-align:right; font-weight:bold;">${rowTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                </tr>
                                `;
                            }).join('')}
                            
                            <tr class="spacer-row">
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>

                            <tr class="totals-row">
                                <td colspan="2" style="text-align:right;">Total</td>
                                <td style="text-align:center;">${totalQty}</td>
                                <td style="text-align:right;">${subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td style="text-align:right;">${totalGST.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                <td style="text-align:right;">₹ ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="footer-content">
                    <div class="footer-left">
                        <div style="margin-bottom: 15px;">
                            <span style="color:gray; font-size: 11px;">Amount Chargeable (in words):</span><br>
                            <strong style="font-size: 12px;">INR ${numberToWords(grandTotal)} Rupees Only</strong>
                        </div>

                        <div style="margin-bottom: 15px;">
                            <div style="font-size: 11px; font-weight: bold; text-decoration: underline; margin-bottom: 4px;">Terms & Conditions:</div>
                            <div style="font-size: 10px; white-space: pre-wrap; line-height: 1.4;">${terms}</div>
                        </div>

                        <div style="display:flex; align-items: flex-start; gap: 15px;">
                            <div>
                                <div style="font-size: 11px; font-weight: bold; text-decoration: underline; margin-bottom: 4px;">Company's Bank Details:</div>
                                <div style="font-size: 10px;">Bank Name: <strong>${(companyProfile as any)?.bankDetails1?.bankName || (companyProfile as any)?.bank1_name || 'N/A'}</strong></div>
                                <div style="font-size: 10px;">A/c No: <strong>${(companyProfile as any)?.bankDetails1?.accountNo || (companyProfile as any)?.bank1_acc || 'N/A'}</strong></div>
                                <div style="font-size: 10px;">IFSC: <strong>${(companyProfile as any)?.bankDetails1?.ifsc || (companyProfile as any)?.bank1_ifsc || 'N/A'}</strong></div>
                                <div style="font-size: 10px;">A/c Name: <strong>${companyProfile?.companyName || 'N/A'}</strong></div>
                            </div>
                            ${(companyProfile as any)?.qrCodeUrl ? `<img src="${(companyProfile as any).qrCodeUrl}" style="width: 60px; height: 60px; border: 1px solid #ddd; padding: 2px;" />` : ''}
                        </div>
                    </div>

                    <div class="footer-right">
                        <div style="width: 100%;">
                            <div class="summary-row"><span>Sub Total</span> <span>₹ ${subTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                            ${gstHtmlRows}
                            <div class="summary-row total"><span>Grand Total</span> <span>₹ ${grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
                        </div>

                        <div style="text-align: center; margin-top: 30px; padding: 15px;">
                            <div style="font-weight:bold; font-size: 11px; margin-bottom: 5px;">For: ${companyProfile?.companyName || 'Company Name'}</div>
                            <div style="height: 50px; display:flex; align-items:center; justify-content:center;">
                                ${(companyProfile as any)?.signatureUrl ? `<img src="${(companyProfile as any).signatureUrl}" style="max-height: 50px; max-width: 120px;" />` : ''}
                            </div>
                            <div style="font-size: 10px; margin-top: 5px;">Authorized Signatory</div>
                        </div>
                    </div>
                </div>

            </div>
        </body>
        </html>
        `;
    };

    const generatePDF = async () => {
        if (!selectedOrg) return Alert.alert("Required", "Please select a client organization.");
        if (items.length === 0) return Alert.alert("Required", "Please add at least one item.");

        const fy = getFinancialYear();
        const shortName = companyProfile?.shortName || 'EST';
        const estimateNo = (mode === 'edit' && existingEstimateNo) ? existingEstimateNo : `${shortName}/${fy}/${Math.floor(100 + Math.random() * 900)}`;

        try {
            const htmlContent = getQuotationHTML(estimateNo);
            const { uri } = await Print.printToFileAsync({ html: htmlContent });
            await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
        } catch (error) {
            Alert.alert("Error", "Could not generate PDF");
        }
    };

    // 🔥 SAVE — via new backend API. On create, estimateNo is omitted so the
    // backend auto-generates it (COMPANY/FY/### pattern); on edit, the
    // existing number is kept as-is.
    const handleSaveQuotation = async () => {
        if (!selectedOrg) return Alert.alert("Required", "Please select a client organization.");
        if (items.length === 0) return Alert.alert("Required", "Please add at least one item.");
        if (items.some(item => !item.name)) return Alert.alert("Required", "Please provide a name for all Custom Products.");

        setIsSaving(true);

        try {
            const payload = {
                orgId: selectedOrg.id === 'lead_temp_org' ? undefined : (selectedOrg.id || undefined),
                docTitle: docTitle,
                orgName: selectedOrg.name || selectedOrg.orgName || 'Unknown',
                orgAddress: selectedOrg.address || selectedOrg.city || '',
                orgPhone: selectedOrg.phone || selectedOrg.mobile || '',
                items: items.map(item => ({
                    name: item.name || '', model: item.model || '',
                    specifications: item.specifications || '', qty: item.qty || 0,
                    price: item.price || 0, gstRate: item.gstRate || 0,
                    isCustom: item.isCustom || false
                })),
                termsAndConditions: terms, 
                taxType: taxType, 
                subTotal: subTotal || 0, totalGst: totalGST || 0, grandTotal: grandTotal || 0,
                date: new Date().toISOString().split('T')[0],
                validTill: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Saved',
            };

            let finalEstimateNo = existingEstimateNo;

            if (mode === 'edit' && id) {
                await updateQuotation(id as string, payload);
                Alert.alert("Success", `Estimate Updated Successfully!`);
            } else {
                const created = await createQuotation(payload);
                finalEstimateNo = created.estimateNo;
                Alert.alert("Success", `Estimate ${finalEstimateNo} Created Successfully!`);
            }

            try {
                const custMobile = selectedOrg.mobile || selectedOrg.phone || "";
                if (custMobile) {
                    sendSystemWhatsApp(custMobile, 'quotation_sent', {
                        customer_name: selectedOrg.name || selectedOrg.orgName || "Customer",
                        quote_no: finalEstimateNo,
                        amount: grandTotal.toLocaleString(),
                        company_name: companyProfile?.companyName || "Our Company"
                    });
                }
            } catch (autoErr) {
                console.log("Auto-Message Error:", autoErr);
            }
            
            router.back(); 
        } catch (e: any) {
            console.error("Save Error:", e); 
            Alert.alert("Error", e?.message || "Could not save quotation.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, {paddingTop: insets.top + 10}]}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {mode === 'edit' ? 'Edit Estimate' : mode === 'from_lead' ? 'Quote for Lead' : 'Create Estimate'}
                </Text>
                <View style={{width: 28}}/>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1}} keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}>
                <ScrollView contentContainerStyle={{padding: 15, paddingBottom: 250}} keyboardShouldPersistTaps="handled">
                    
                    <TouchableOpacity style={styles.selectBox} onPress={() => setShowOrgModal(true)}>
                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                            <View style={styles.iconBg}><Ionicons name="business" size={20} color="#3b5998" /></View>
                            <View style={{marginLeft: 10}}>
                                <Text style={styles.label}>Bill To (Client)</Text>
                                <Text style={selectedOrg ? styles.valText : styles.placeholderText}>
                                    {selectedOrg ? selectedOrg.name || selectedOrg.orgName : 'Tap to select client...'}
                                </Text>
                            </View>
                        </View>
                        {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="chevron-down" size={20} color="gray" />}
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <Text style={styles.sectionTitle}>Items ({items.length})</Text>
                    {items.map((item, index) => (
                        <View key={item.id || index} style={styles.itemCard}>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10}}>
                                <View style={{flex: 1, marginRight: 10}}>
                                    {item.isCustom ? (
                                        <>
                                            <TextInput 
                                                style={[styles.input, {marginBottom: 6, borderColor: '#3b5998'}]} 
                                                placeholder="Type Product Name *" 
                                                value={item.name} 
                                                onChangeText={(val) => updateItemField(index, 'name', val)} 
                                            />
                                            <TextInput 
                                                style={[styles.input, {marginBottom: 6}]} 
                                                placeholder="Type Model Name (Optional)" 
                                                value={item.model} 
                                                onChangeText={(val) => updateItemField(index, 'model', val)} 
                                            />
                                        </>
                                    ) : (
                                        <View style={{flexDirection: 'row', alignItems: 'center'}}>
                                            <Ionicons name="cube" size={20} color="#3b5998" style={{marginRight: 8}}/>
                                            <Text style={styles.itemName} numberOfLines={1}>{item.name} {item.model ? `(${item.model})` : ''}</Text>
                                        </View>
                                    )}
                                </View>
                                <TouchableOpacity onPress={() => removeItem(index)} style={{padding:5}}>
                                    <Ionicons name="trash-outline" size={20} color="red" />
                                </TouchableOpacity>
                            </View>
                            
                            <Text style={styles.subLabel}>Specifications (Printed on PDF)</Text>
                            <TextInput 
                                style={[styles.input, {height: 60, textAlignVertical: 'top', marginBottom: 10}]} 
                                multiline 
                                value={item.specifications} 
                                onChangeText={(val) => updateItemField(index, 'specifications', val)} 
                            />

                            <View style={{flexDirection: 'row', gap: 10}}>
                                <View style={{flex: 1}}>
                                    <Text style={styles.subLabel}>Price (₹)</Text>
                                    <TextInput style={styles.input} keyboardType="numeric" value={item.price.toString()} onChangeText={(val) => updateItemField(index, 'price', val)} />
                                </View>
                                <View style={{flex: 0.5}}>
                                    <Text style={styles.subLabel}>Qty</Text>
                                    <TextInput style={styles.input} keyboardType="numeric" value={item.qty.toString()} onChangeText={(val) => updateItemField(index, 'qty', val)} />
                                </View>
                                <View style={{flex: 0.6}}>
                                    <Text style={styles.subLabel}>GST (%)</Text>
                                    <TextInput style={styles.input} keyboardType="numeric" value={item.gstRate.toString()} onChangeText={(val) => updateItemField(index, 'gstRate', val)} />
                                </View>
                            </View>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.addItemBtn} onPress={() => setShowProductModal(true)}>
                        <Ionicons name="add-circle-outline" size={20} color="#3b5998" />
                        <Text style={styles.addItemText}>Add Product</Text>
                    </TouchableOpacity>

                    {items.length > 0 && (
                        <>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 5}}>
    <Text style={styles.sectionTitle}>Document Title</Text>
    <View style={{flexDirection: 'row', backgroundColor: '#e3f2fd', borderRadius: 8, padding: 3}}>
        <TouchableOpacity 
            onPress={() => setDocTitle('ESTIMATE')} 
            style={[styles.taxBtn, docTitle === 'ESTIMATE' && styles.taxBtnActive]}>
            <Text style={[styles.taxBtnText, docTitle === 'ESTIMATE' && styles.taxBtnTextActive]}>Estimate</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            onPress={() => setDocTitle('PROFORMA INVOICE')} 
            style={[styles.taxBtn, docTitle === 'PROFORMA INVOICE' && styles.taxBtnActive]}>
            <Text style={[styles.taxBtnText, docTitle === 'PROFORMA INVOICE' && styles.taxBtnTextActive]}>Proforma</Text>
        </TouchableOpacity>
        <TouchableOpacity 
            onPress={() => setDocTitle('QUOTATION')} 
            style={[styles.taxBtn, docTitle === 'QUOTATION' && styles.taxBtnActive]}>
            <Text style={[styles.taxBtnText, docTitle === 'QUOTATION' && styles.taxBtnTextActive]}>Quotation</Text>
        </TouchableOpacity>
    </View>
</View>
                            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 5}}>
                                <Text style={styles.sectionTitle}>Tax Type</Text>
                                <View style={{flexDirection: 'row', backgroundColor: '#e3f2fd', borderRadius: 8, padding: 3}}>
                                    <TouchableOpacity onPress={() => setTaxType('CGST/SGST')} style={[styles.taxBtn, taxType === 'CGST/SGST' && styles.taxBtnActive]}>
                                        <Text style={[styles.taxBtnText, taxType === 'CGST/SGST' && styles.taxBtnTextActive]}>CGST/SGST</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setTaxType('IGST')} style={[styles.taxBtn, taxType === 'IGST' && styles.taxBtnActive]}>
                                        <Text style={[styles.taxBtnText, taxType === 'IGST' && styles.taxBtnTextActive]}>IGST</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            <View style={styles.summaryCard}>
                                <View style={styles.summaryRow}><Text style={styles.summaryText}>Sub Total</Text><Text style={styles.summaryText}>₹ {subTotal.toLocaleString()}</Text></View>
                                
                                {Object.keys(gstBreakdown).map((rateStr) => {
                                    const rate = Number(rateStr);
                                    const amount = gstBreakdown[rate];
                                    if (taxType === 'IGST') {
                                        return <View key={`igst-${rate}`} style={styles.summaryRow}><Text style={styles.summarySubText}>IGST @ {rate}%</Text><Text style={styles.summarySubText}>₹ {amount.toLocaleString()}</Text></View>;
                                    } else {
                                        return (
                                            <React.Fragment key={`cgst-sgst-${rate}`}>
                                                <View style={styles.summaryRow}><Text style={styles.summarySubText}>CGST @ {rate/2}%</Text><Text style={styles.summarySubText}>₹ {(amount/2).toLocaleString()}</Text></View>
                                                <View style={styles.summaryRow}><Text style={styles.summarySubText}>SGST @ {rate/2}%</Text><Text style={styles.summarySubText}>₹ {(amount/2).toLocaleString()}</Text></View>
                                            </React.Fragment>
                                        );
                                    }
                                })}

                                <View style={[styles.summaryRow, {borderTopWidth: 1, borderColor: '#eee', paddingTop: 10, marginTop: 5}]}>
                                    <Text style={styles.grandTotalText}>Grand Total</Text>
                                    <Text style={styles.grandTotalText}>₹ {grandTotal.toLocaleString()}</Text>
                                </View>
                            </View>
                        </>
                    )}

                    <View style={{marginTop: 25}}>
                        <Text style={styles.sectionTitle}>Select PDF Format</Text>
                        <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                            <TouchableOpacity style={[styles.chip, pdfTheme === 'theme1' && styles.activeChip]} onPress={() => setPdfTheme('theme1')}>
                                <Text style={[styles.chipText, pdfTheme === 'theme1' && styles.activeChipText]}>Format 1 (Logo Right)</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.chip, pdfTheme === 'theme2' && styles.activeChip]} onPress={() => setPdfTheme('theme2')}>
                                <Text style={[styles.chipText, pdfTheme === 'theme2' && styles.activeChipText]}>Format 2 (Logo Left)</Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.sectionTitle}>Terms & Conditions</Text>
                        <TextInput style={[styles.input, {height: 250, textAlignVertical: 'top', backgroundColor: 'white', lineHeight: 22}]} multiline value={terms} onChangeText={setTerms} />
                    </View>

                    <View style={{height: 100}} />
                </ScrollView>
            </KeyboardAvoidingView>

            <View style={[styles.footerBtnView, {paddingBottom: Math.max(insets.bottom, 15)}]}>
                <View style={{flexDirection: 'row', gap: 10}}>
                    <TouchableOpacity style={[styles.generateBtn, {flex: 1, backgroundColor: '#FFA000'}]} onPress={generatePDF}>
                        <Ionicons name="eye" size={20} color="white" style={{marginRight: 8}} />
                        <Text style={styles.generateBtnText}>Preview</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.generateBtn, {flex: 1, backgroundColor: '#2e7d32'}]} onPress={handleSaveQuotation} disabled={isSaving}>
                        {isSaving ? <ActivityIndicator color="white" /> : (
                            <>
                                <Ionicons name={mode === 'edit' ? "checkmark-done" : "save"} size={20} color="white" style={{marginRight: 8}} />
                                <Text style={styles.generateBtnText}>{mode === 'edit' ? 'Update' : 'Save'}</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* MODALS */}
            <Modal visible={showOrgModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={[styles.modalHeader, {paddingTop: insets.top + 10}]}>
                        <Text style={styles.modalTitle}>Select Client</Text>
                        <TouchableOpacity onPress={() => setShowOrgModal(false)}><Ionicons name="close" size={28} color="black" /></TouchableOpacity>
                    </View>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput style={styles.searchInput} placeholder="Search Client Name..." value={orgSearch} onChangeText={setOrgSearch} />
                    </View>
                    <FlatList 
                        data={filteredOrgs} keyExtractor={item => item.id}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalListItem} onPress={() => { setSelectedOrg(item); setShowOrgModal(false); setOrgSearch(''); }}>
                                <View style={styles.iconBg}><Ionicons name="business" size={20} color="#3b5998" /></View>
                                <View style={{flex: 1}}>
                                    <Text style={{fontSize: 15, fontWeight: 'bold', color: '#333'}}>{item.name || item.orgName}</Text>
                                    <Text style={{fontSize: 12, color: 'gray'}}>{item.city || 'No City'}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>

            <Modal visible={showProductModal} animationType="slide">
                <View style={styles.modalContainer}>
                    <View style={[styles.modalHeader, {paddingTop: insets.top + 10}]}>
                        <Text style={styles.modalTitle}>Select Product</Text>
                        <TouchableOpacity onPress={() => setShowProductModal(false)}><Ionicons name="close" size={28} color="black" /></TouchableOpacity>
                    </View>
                    <View style={styles.searchBar}>
                        <Ionicons name="search" size={20} color="gray" />
                        <TextInput style={styles.searchInput} placeholder="Search Product Name or Model..." value={prodSearch} onChangeText={setProdSearch} autoFocus />
                    </View>
                    <FlatList 
                        data={filteredProds} keyExtractor={item => item.id}
                        renderItem={({item}) => (
                            <TouchableOpacity style={styles.modalListItem} onPress={() => selectProduct(item)}>
                                <View style={styles.iconBg}><Ionicons name="cube" size={20} color="#3b5998" /></View>
                                <View style={{flex: 1}}>
                                    <Text style={{fontSize: 15, fontWeight: 'bold', color: '#333'}}>{item.name}</Text>
                                    <Text style={{fontSize: 12, color: 'gray'}}>Model: {item.model} • Price: ₹{item.price || 0}</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, backgroundColor: 'white', elevation: 2, alignItems:'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    iconBg: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    selectBox: { backgroundColor: 'white', padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
    label: { fontSize: 12, color: 'gray', marginBottom: 2 },
    valText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    placeholderText: { fontSize: 15, color: '#aaa', fontStyle: 'italic' },
    divider: { height: 1, backgroundColor: '#ddd', marginVertical: 20 },
    sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#555', marginBottom: 5 },
    itemCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15, elevation: 1, borderWidth: 1, borderColor: '#eee' },
    itemName: { fontSize: 15, fontWeight: 'bold', color: '#333' },
    subLabel: { fontSize: 11, color: 'gray', marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8, fontSize: 14, backgroundColor: '#f9f9f9', color: '#333' },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, backgroundColor: '#e3f2fd', borderRadius: 10, borderWidth: 1, borderColor: '#bbdefb', borderStyle: 'dashed' },
    addItemText: { color: '#3b5998', fontWeight: 'bold', marginLeft: 8 },
    summaryCard: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginTop: 10, elevation: 2 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryText: { fontSize: 14, color: '#333', fontWeight: 'bold' },
    summarySubText: { fontSize: 12, color: '#555' },
    grandTotalText: { fontSize: 18, fontWeight: 'bold', color: '#2e7d32' },
    
    taxBtn: { paddingHorizontal: 15, paddingVertical: 6, borderRadius: 6 },
    taxBtnActive: { backgroundColor: '#3b5998' },
    taxBtnText: { fontSize: 12, color: '#3b5998', fontWeight: 'bold' },
    taxBtnTextActive: { color: 'white' },

    chip: { paddingHorizontal: 15, paddingVertical: 10, backgroundColor: '#f0f0f0', borderRadius: 20, borderWidth: 1, borderColor: '#ddd' },
    activeChip: { backgroundColor: '#3b5998', borderColor: '#3b5998' },
    chipText: { color: '#555', fontSize: 13, fontWeight: 'bold' },
    activeChipText: { color: 'white' },

    footerBtnView: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'white', padding: 15, paddingTop: 15, borderTopWidth: 1, borderColor: '#eee', elevation: 10 },
    generateBtn: { padding: 15, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    generateBtnText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
    modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: 'white', borderBottomWidth: 1, borderColor: '#eee', alignItems: 'center' },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 15, paddingHorizontal: 15, borderRadius: 10, height: 45, borderWidth: 1, borderColor: '#ddd' },
    searchInput: { flex: 1, marginLeft: 10, fontSize: 15 },
    modalListItem: { backgroundColor: 'white', padding: 15, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }
});
