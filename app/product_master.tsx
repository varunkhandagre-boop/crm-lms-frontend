import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

// 🔥 SAAS IMPORTS (Firebase DB imports removed)
import { useSaaSDB } from '../hooks/useSaaSDB';
import { useData } from './context/DataContext';

export default function ProductMasterScreen() {
    const router = useRouter();
    
    // 🔥 1. Context se sirf user nikalenge
    const { currentUser } = useData();
    
    // 🔥 2. Naya SaaS Engine
    const { fetchSaaSData, addSaaSData, updateSaaSData, deleteSaaSData, isDbLoading } = useSaaSDB();

    // 🔥 3. Lazy Loaded States
    const [productList, setProductList] = useState<any[]>([]);

    // --- FORM STATES ---
    const [name, setName] = useState('');
    const [model, setModel] = useState('');
    const [series, setSeries] = useState('');
    const [desc, setDesc] = useState('');
    const [specifications, setSpecifications] = useState('');
    
    // Price and GST State
    const [price, setPrice] = useState('');
    const [gstRate, setGstRate] = useState('');
    
    const [catalogs, setCatalogs] = useState<{title: string, url: string}[]>([]);
    const [videos, setVideos] = useState<{title: string, url: string}[]>([]);

    const [linkTitle, setLinkTitle] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [linkType, setLinkType] = useState<'Catalog' | 'Video'>('Catalog');

    const [searchText, setSearchText] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null); 

    const [visibleCount, setVisibleCount] = useState(20);

    const canEdit = ['Admin', 'Manager', 'Account', 'Accountant', 'Hr', 'SuperAdmin'].includes(currentUser?.role || '');

    useEffect(() => {
        setVisibleCount(20);
    }, [searchText]);

    // 🔥 4. LOAD SAAS DATA ON MOUNT
    const loadProducts = async () => {
        if (currentUser?.companyId) {
            const data = await fetchSaaSData("products");
            setProductList(data);
        }
    };

    useEffect(() => {
        loadProducts();
    }, [currentUser]);

    const addLinkToList = () => {
        if(!linkTitle.trim() || !linkUrl.trim()) return Alert.alert("Required", "Enter both Title and Link.");
        const newLink = { title: linkTitle, url: linkUrl };
        if(linkType === 'Catalog') setCatalogs([...catalogs, newLink]);
        else setVideos([...videos, newLink]);
        setLinkTitle(''); setLinkUrl('');
    };

    const removeLink = (type: 'Catalog' | 'Video', index: number) => {
        if(type === 'Catalog') {
            const newStats = [...catalogs];
            newStats.splice(index, 1);
            setCatalogs(newStats);
        } else {
            const newStats = [...videos];
            newStats.splice(index, 1);
            setVideos(newStats);
        }
    };

    const handleOpenLink = (url: string) => {
        if (url) Linking.openURL(url).catch(() => Alert.alert("Error", "Invalid Link"));
        else Alert.alert("No Link", "Link not available.");
    };

    const handleShare = async (title: string, url: string, type: string) => {
        if (!url) return Alert.alert("No Link", `${type} link is missing.`);
        try { await Share.share({ message: `📄 ${type}: ${title}\n🔗 ${url}` }); } catch (error) {}
    };

    // 🔥 5. SAAS ENGINE SAVE / UPDATE LOGIC
    const handleSave = async () => {
        if (!name.trim() || !model.trim()) return Alert.alert("Missing Fields", "Product Name and Model Name are required.");
        
        setIsSaving(true);
        const productData = { 
            name: name.trim(),
            model: model.trim(),
            series: series.trim(),
            description: desc.trim(),
            specifications: specifications.trim(),
            price: Number(price) || 0,     
            gstRate: Number(gstRate) || 0, 
            catalogs: catalogs, 
            videos: videos,
            updatedBy: currentUser?.name, 
            updatedAt: new Date().toISOString()
        };

        try {
            if (editingId) {
                const res = await updateSaaSData("products", editingId, productData);
                if (res.success) {
                    setProductList(prev => prev.map(item => item.id === editingId ? { ...item, ...productData } : item));
                    Alert.alert("Updated", "Product updated successfully!");
                } else {
                    throw new Error("Update Failed");
                }
            } else {
                const newProductData = {
                    ...productData,
                    addedBy: currentUser?.name, 
                    createdAt: new Date().toISOString() 
                };
                const res = await addSaaSData("products", newProductData);
                if (res.success) {
                    setProductList([{ id: res.id, ...newProductData }, ...productList]);
                    Alert.alert("Success", "Product added successfully!");
                } else {
                    throw new Error("Add Failed");
                }
            }
            closeModal();
        } catch (e) { 
            Alert.alert("Error", "Operation failed."); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleEdit = (item: any) => {
        setEditingId(item.id);
        setName(item.name);
        setModel(item.model || '');
        setSeries(item.series || '');
        setDesc(item.description || '');
        setSpecifications(item.specifications || '');
        setPrice(item.price ? item.price.toString() : '');       
        setGstRate(item.gstRate ? item.gstRate.toString() : ''); 
        
        const oldCat = item.catalogLink ? [{title: 'Main Catalog', url: item.catalogLink}] : [];
        const oldVid = item.videoLink ? [{title: 'Demo Video', url: item.videoLink}] : [];
        
        setCatalogs(item.catalogs || oldCat);
        setVideos(item.videos || oldVid);

        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false); setEditingId(null);
        setName(''); setModel(''); setSeries(''); setDesc(''); setSpecifications(''); setCatalogs([]); setVideos([]);
        setPrice(''); setGstRate(''); 
        setLinkTitle(''); setLinkUrl('');
    };

    // 🔥 6. SAAS ENGINE DELETE LOGIC
    const handleDelete = async (id: string, pname: string) => {
        Alert.alert("Delete", `Remove ${pname}?`, [
            { text: "Cancel" },
            { text: "Delete", style: 'destructive', onPress: async () => { 
                try { 
                    const res = await deleteSaaSData("products", id); 
                    if (res.success) {
                        setProductList(prev => prev.filter(item => item.id !== id));
                    }
                } catch(e) {} 
            }}
        ]);
    };

    const renderItem = ({ item }: any) => {
        const isExpanded = expandedId === item.id;
        const displayCatalogs = item.catalogs || (item.catalogLink ? [{title: 'Brochure', url: item.catalogLink}] : []);
        const displayVideos = item.videos || (item.videoLink ? [{title: 'Video', url: item.videoLink}] : []);

        return (
            <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={() => setExpandedId(isExpanded ? null : item.id)}>
                <View style={styles.cardHeader}>
                    <View style={{flexDirection:'row', alignItems:'center', flex:1}}>
                        <View style={styles.iconBg}><Ionicons name="cube" size={24} color="#3b5998" /></View>
                        <View>
                            <Text style={styles.prodName}>{item.name}</Text>
                            <Text style={styles.prodModel}>Model: {item.model || 'N/A'} {item.series ? `• ${item.series}` : ''}</Text>
                        </View>
                    </View>
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={22} color="gray" />
                </View>

                {isExpanded && (
                    <View style={styles.detailsBox}>
                        
                        <View style={styles.priceRow}>
                            <Text style={styles.priceText}>₹ {item.price ? item.price.toLocaleString() : '0'}</Text>
                            <Text style={styles.gstBadge}>GST: {item.gstRate || 0}%</Text>
                        </View>

                        {item.description ? <Text style={styles.descText}>{item.description}</Text> : null}
                        
                        {item.specifications ? (
                            <View style={styles.specsBox}>
                                <Text style={styles.specsTitle}>Quotations Specifications:</Text>
                                <Text style={styles.specsText}>{item.specifications}</Text>
                            </View>
                        ) : null}

                        {displayCatalogs.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionLabel}>DOCUMENTS ({displayCatalogs.length})</Text>
                                {displayCatalogs.map((link:any, index:number) => (
                                    <View key={index} style={styles.linkRow}>
                                        <Text style={styles.linkTitle} numberOfLines={1}>📄 {link.title}</Text>
                                        <View style={{flexDirection:'row', gap:10}}>
                                            <TouchableOpacity style={styles.bigActionBtn} onPress={() => handleOpenLink(link.url)}>
                                                <Ionicons name="eye" size={22} color="#1565c0" />
                                                <Text style={[styles.btnText, {color:'#1565c0'}]}>View</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.bigActionBtn} onPress={() => handleShare(link.title, link.url, 'Catalog')}>
                                                <Ionicons name="share-social" size={22} color="#555" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {displayVideos.length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionLabel}>VIDEOS ({displayVideos.length})</Text>
                                {displayVideos.map((link:any, index:number) => (
                                    <View key={index} style={styles.linkRow}>
                                        <Text style={styles.linkTitle} numberOfLines={1}>🎥 {link.title}</Text>
                                        <View style={{flexDirection:'row', gap:10}}>
                                            <TouchableOpacity style={[styles.bigActionBtn, {backgroundColor:'#ffebee'}]} onPress={() => handleOpenLink(link.url)}>
                                                <Ionicons name="play-circle" size={22} color="#d32f2f" />
                                                <Text style={[styles.btnText, {color:'#d32f2f'}]}>Watch</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={styles.bigActionBtn} onPress={() => handleShare(link.title, link.url, 'Video')}>
                                                <Ionicons name="share-social" size={22} color="#555" />
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {canEdit && (
                            <View style={styles.adminRow}>
                                <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(item)}>
                                    <Ionicons name="create-outline" size={18} color="white" />
                                    <Text style={styles.adminBtnText}>Edit Details</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                                    <Ionicons name="trash-outline" size={18} color="white" />
                                    <Text style={styles.adminBtnText}>Delete</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                )}
            </TouchableOpacity>
        );
    };
    
    const filteredList = productList
        .filter((p: any) => 
            p.name?.toLowerCase().includes(searchText.toLowerCase()) || 
            p.model?.toLowerCase().includes(searchText.toLowerCase())
        )
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    const renderedList = filteredList.slice(0, visibleCount);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={28} color="#333" /></TouchableOpacity>
                <Text style={styles.headerTitle}>Product Master</Text>
                {canEdit ? (
                    <TouchableOpacity style={styles.addIconBtn} onPress={() => setModalVisible(true)}>
                        <Ionicons name="add" size={30} color="white" />
                    </TouchableOpacity>
                ) : <View style={{width: 30}} />}
            </View>

            <View style={styles.searchBar}>
                {isDbLoading ? <ActivityIndicator size="small" color="#3b5998" /> : <Ionicons name="search" size={22} color="gray" />}
                <TextInput style={styles.searchInput} placeholder="Search Name or Model..." value={searchText} onChangeText={setSearchText} />
            </View>
                        
            <Text style={{textAlign:'right', fontSize:12, color:'gray', paddingRight:15, marginBottom:5}}>
                Total: <Text style={{fontWeight:'bold', color:'#3b5998'}}>{filteredList.length}</Text>
            </Text>

            <FlatList 
                data={renderedList}
                keyExtractor={item => item.id}
                renderItem={renderItem}
                contentContainerStyle={{padding: 15, paddingBottom: 100}}
                ListEmptyComponent={
                    <View style={{alignItems: 'center', marginTop: 50}}>
                        {isDbLoading ? <ActivityIndicator size="large" color="#3b5998" /> : <Text style={{textAlign:'center', color:'gray'}}>No products found.</Text>}
                    </View>
                }
                
                ListFooterComponent={
                    <View style={{ paddingBottom: 80 }}>
                        {visibleCount < filteredList.length ? (
                            <TouchableOpacity 
                                onPress={() => setVisibleCount(prev => prev + 20)} 
                                style={{
                                    padding: 12, 
                                    backgroundColor: '#fff', 
                                    alignItems: 'center', 
                                    marginVertical: 10, 
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: '#ddd'
                                }}
                            >
                                <Text style={{fontWeight:'bold', color:'#3b5998'}}>
                                    👇 Load More Records ({filteredList.length - visibleCount} remaining)
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            filteredList.length > 0 ? (
                                <Text style={{textAlign:'center', padding:20, color:'#aaa', fontSize:12, fontStyle:'italic'}}>
                                    --- End of List ---
                                </Text>
                            ) : null
                        )}
                    </View>
                }
            />

            <Modal visible={modalVisible} transparent={true} animationType="slide">
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                    style={{flex: 1}}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>{editingId ? 'Edit Product' : 'Add New Product'}</Text>
                                <TouchableOpacity onPress={closeModal} style={{padding:5}}><Ionicons name="close" size={30} color="#333" /></TouchableOpacity>
                            </View>
                            
                            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:20}}>
                                
                                <Text style={styles.label}>Product Details</Text>
                                <TextInput style={styles.inputBig} placeholder="Product Name (e.g. Ventilator) *" value={name} onChangeText={setName} />
                                
                                <View style={{flexDirection:'row', gap:10}}>
                                    <TextInput style={[styles.inputBig, {flex:1}]} placeholder="Model Name (e.g. CVENT) *" value={model} onChangeText={setModel} />
                                    <TextInput style={[styles.inputBig, {flex:0.6}]} placeholder="Series" value={series} onChangeText={setSeries} />
                                </View>

                                <View style={{flexDirection:'row', gap:10}}>
                                    <TextInput style={[styles.inputBig, {flex:1}]} placeholder="Price (₹)" keyboardType="numeric" value={price} onChangeText={setPrice} />
                                    <TextInput style={[styles.inputBig, {flex:0.6}]} placeholder="GST (%)" keyboardType="numeric" value={gstRate} onChangeText={setGstRate} />
                                </View>
                                
                                <TextInput style={[styles.inputBig, {height:60, textAlignVertical:'top'}]} multiline placeholder="Description / Features..." value={desc} onChangeText={setDesc} />

                                <Text style={styles.label}>Specifications (For Quotations)</Text>
                                <TextInput style={[styles.inputBig, {height:80, textAlignVertical:'top'}]} multiline placeholder="Enter specs (15 inch, Touchscreen...)" value={specifications} onChangeText={setSpecifications} />

                                <View style={styles.divider}/>
                                
                                <Text style={styles.label}>Media & Catalogs</Text>
                                <View style={styles.linkInputBox}>
                                    <View style={{flexDirection:'row', marginBottom:10, gap:10}}>
                                        <TouchableOpacity style={[styles.typeBtn, linkType === 'Catalog' && styles.activeType]} onPress={() => setLinkType('Catalog')}>
                                            <Ionicons name="document-text" size={18} color={linkType === 'Catalog'?'white':'#3b5998'} />
                                            <Text style={[styles.typeText, linkType === 'Catalog' && {color:'white'}]}>Catalog</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.typeBtn, linkType === 'Video' && styles.activeType]} onPress={() => setLinkType('Video')}>
                                            <Ionicons name="videocam" size={18} color={linkType === 'Video'?'white':'#3b5998'} />
                                            <Text style={[styles.typeText, linkType === 'Video' && {color:'white'}]}>Video</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <TextInput style={styles.inputBig} placeholder="Title (e.g. Brochure 2024)" value={linkTitle} onChangeText={setLinkTitle} />
                                    <TextInput style={styles.inputBig} placeholder="Paste Link (http://...)" value={linkUrl} onChangeText={setLinkUrl} />
                                    
                                    <TouchableOpacity style={styles.addLinkBtn} onPress={addLinkToList}>
                                        <Text style={{color:'white', fontWeight:'bold', fontSize:16}}>+ Add Link</Text>
                                    </TouchableOpacity>
                                </View>

                                {catalogs.map((l, i) => (
                                    <View key={i} style={styles.addedLinkItem}>
                                        <Text style={{fontSize:14, fontWeight:'500'}}>📄 {l.title}</Text>
                                        <TouchableOpacity onPress={() => removeLink('Catalog', i)} style={{padding:5}}><Ionicons name="close-circle" size={24} color="red"/></TouchableOpacity>
                                    </View>
                                ))}
                                {videos.map((l, i) => (
                                    <View key={i} style={styles.addedLinkItem}>
                                        <Text style={{fontSize:14, fontWeight:'500'}}>🎥 {l.title}</Text>
                                        <TouchableOpacity onPress={() => removeLink('Video', i)} style={{padding:5}}><Ionicons name="close-circle" size={24} color="red"/></TouchableOpacity>
                                    </View>
                                ))}

                                <View style={{height:20}}/>

                                <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
                                    {isSaving ? <ActivityIndicator color="white"/> : <Text style={styles.saveText}>{editingId ? 'Update Product' : 'Save Product'}</Text>}
                                </TouchableOpacity>
                            </ScrollView>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, paddingTop: 50, backgroundColor: 'white', elevation: 2, alignItems:'center' },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    addIconBtn: { backgroundColor:'#3b5998', padding:10, borderRadius:25 },

    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', margin: 15, marginBottom: 5, paddingHorizontal: 15, borderRadius: 10, height: 50, borderWidth:1, borderColor:'#ddd' },
    searchInput: { flex:1, marginLeft:10, fontSize:16 },

    card: { backgroundColor: 'white', borderRadius: 12, marginBottom: 12, padding: 15, elevation: 2 },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    iconBg: { width: 45, height: 45, borderRadius: 23, backgroundColor: '#e3f2fd', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    
    prodName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    prodModel: { fontSize: 13, color: '#555', marginTop:3, fontWeight:'600' },

    detailsBox: { marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee' },
    
    priceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
    priceText: { fontSize: 18, fontWeight: 'bold', color: '#e53935' },
    gstBadge: { backgroundColor: '#ffebee', color: '#c62828', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 12, fontWeight: 'bold', overflow: 'hidden' },

    descText: { fontSize: 14, color: '#444', marginBottom: 15, lineHeight: 20 },
    
    specsBox: { backgroundColor: '#f1f8e9', padding: 10, borderRadius: 8, marginBottom: 15, borderWidth: 1, borderColor: '#c5e1a5' },
    specsTitle: { fontSize: 12, fontWeight: 'bold', color: '#558b2f', marginBottom: 4 },
    specsText: { fontSize: 13, color: '#33691e', lineHeight: 18 },

    section: { marginBottom: 15 },
    sectionLabel: { fontSize:12, fontWeight:'bold', color:'#888', marginBottom:8, letterSpacing:1 },
    linkRow: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#f9f9f9', padding:12, borderRadius:8, marginBottom:8, borderWidth:1, borderColor:'#f0f0f0' },
    linkTitle: { fontSize:14, color:'#333', maxWidth:'55%', fontWeight:'500' },

    bigActionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor:'#e3f2fd', minWidth: 60, justifyContent:'center' },
    btnText: { fontSize: 13, fontWeight: 'bold', marginLeft: 6 },

    adminRow: { flexDirection:'row', justifyContent:'space-between', marginTop: 15, gap: 15 },
    editBtn: { backgroundColor: '#FFA000', paddingVertical: 12, borderRadius: 8, flexDirection:'row', alignItems:'center', flex:1, justifyContent:'center' },
    deleteBtn: { backgroundColor: '#d32f2f', paddingVertical: 12, borderRadius: 8, flexDirection:'row', alignItems:'center', flex:1, justifyContent:'center' },
    adminBtnText: { color:'white', fontSize:14, fontWeight:'bold', marginLeft:6 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#3b5998' },
    
    label: { fontSize: 14, fontWeight: 'bold', color: '#3b5998', marginBottom: 8, marginTop: 10 },
    
    inputBig: { backgroundColor: '#f9f9f9', padding: 15, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', fontSize: 16, marginBottom:12 },
    
    divider: { height:1, backgroundColor:'#eee', marginVertical:15 },

    linkInputBox: { backgroundColor:'#e3f2fd', padding:15, borderRadius:12 },
    typeBtn: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', padding:12, borderRadius:8, borderWidth:1, borderColor:'#3b5998', backgroundColor:'white' },
    activeType: { backgroundColor:'#3b5998' },
    typeText: { fontSize:14, color:'#3b5998', fontWeight:'bold', marginLeft:5 },
    
    addLinkBtn: { backgroundColor:'#1565c0', padding:15, borderRadius:10, alignItems:'center', marginTop:10 },

    addedLinkItem: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, backgroundColor:'#fff', borderRadius:8, marginTop:8, borderWidth:1, borderColor:'#eee' },

    saveBtn: { backgroundColor: '#3b5998', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10, marginBottom:30 },
    saveText: { color: 'white', fontWeight: 'bold', fontSize: 18 }
});