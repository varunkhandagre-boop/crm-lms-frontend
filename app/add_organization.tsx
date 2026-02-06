import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useData } from './context/DataContext';

export default function AddOrganizationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams(); 
  
  // 🔥 DATA CONTEXT
  const { addOrganization, updateOrganization, orgList, user } = useData();

  const isEditMode = params.editId ? true : false;

  // --- INDIA DATA: STATE -> DISTRICT MAPPING ---
  const stateDistrictData: any = {
    "Andhra Pradesh": ["Anantapur", "Chittoor", "East Godavari", "Guntur", "Krishna", "Kurnool", "Prakasam", "Srikakulam", "Sri Potti Sriramulu Nellore", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR District, Kadapa", "Other"],
    "Arunachal Pradesh": ["Tawang", "West Kameng", "East Kameng", "Papum Pare", "Kurung Kumey", "Kra Daadi", "Lower Subansiri", "Upper Subansiri", "West Siang", "East Siang", "Siang", "Upper Siang", "Lower Siang", "Lower Dibang Valley", "Dibang Valley", "Anjaw", "Lohit", "Namsai", "Changlang", "Tirap", "Longding", "Other"],
    "Assam": ["Baksa", "Barpeta", "Biswanath", "Bongaigaon", "Cachar", "Charaideo", "Chirang", "Darrang", "Dhemaji", "Dhubri", "Dibrugarh", "Dima Hasao", "Goalpara", "Golaghat", "Hailakandi", "Hojai", "Jorhat", "Kamrup", "Kamrup Metropolitan", "Karbi Anglong", "Karimganj", "Kokrajhar", "Lakhimpur", "Majuli", "Morigaon", "Nagaon", "Nalbari", "Sivasagar", "Sonitpur", "South Salmara-Mankachar", "Tinsukia", "Udalguri", "West Karbi Anglong", "Other"],
    "Bihar": ["Araria", "Arwal", "Aurangabad", "Banka", "Begusarai", "Bhagalpur", "Bhojpur", "Buxar", "Darbhanga", "East Champaran", "Gaya", "Gopalganj", "Jamui", "Jehanabad", "Kaimur", "Katihar", "Khagaria", "Kishanganj", "Lakhisarai", "Madhepura", "Madhubani", "Munger", "Muzaffarpur", "Nalanda", "Nawada", "Patna", "Purnia", "Rohtas", "Saharsa", "Samastipur", "Saran", "Sheikhpura", "Sheohar", "Sitamarhi", "Siwan", "Supaul", "Vaishali", "West Champaran", "Other"],
    "Chhattisgarh": ["Balod", "Baloda Bazar", "Balrampur", "Bastar", "Bemetara", "Bijapur", "Bilaspur", "Dantewada", "Dhamtari", "Durg", "Gariaband", "Janjgir-Champa", "Jashpur", "Kabirdham", "Kanker", "Kondagaon", "Korba", "Koriya", "Mahasamund", "Mungeli", "Narayanpur", "Raigarh", "Raipur", "Rajnandgaon", "Sukma", "Surajpur", "Surguja", "Other"],
    "Goa": ["North Goa", "South Goa", "Other"],
    "Gujarat": ["Ahmedabad", "Amreli", "Anand", "Aravalli", "Banaskantha", "Bharuch", "Bhavnagar", "Botad", "Chhota Udaipur", "Dahod", "Dang", "Devbhoomi Dwarka", "Gandhinagar", "Gir Somnath", "Jamnagar", "Junagadh", "Kheda", "Kutch", "Mahisagar", "Mehsana", "Morbi", "Narmada", "Navsari", "Panchmahal", "Patan", "Porbandar", "Rajkot", "Sabarkantha", "Surat", "Surendranagar", "Tapi", "Vadodara", "Valsad", "Other"],
    "Haryana": ["Ambala", "Bhiwani", "Charkhi Dadri", "Faridabad", "Fatehabad", "Gurugram", "Hisar", "Jhajjar", "Jind", "Kaithal", "Karnal", "Kurukshetra", "Mahendragarh", "Nuh", "Palwal", "Panchkula", "Panipat", "Rewari", "Rohtak", "Sirsa", "Sonipat", "Yamunanagar", "Other"],
    "Himachal Pradesh": ["Bilaspur", "Chamba", "Hamirpur", "Kangra", "Kinnaur", "Kullu", "Lahaul and Spiti", "Mandi", "Shimla", "Sirmaur", "Solan", "Una", "Other"],
    "Jharkhand": ["Bokaro", "Chatra", "Deoghar", "Dhanbad", "Dumka", "East Singhbhum", "Garhwa", "Giridih", "Godda", "Gumla", "Hazaribagh", "Jamtara", "Khunti", "Koderma", "Latehar", "Lohardaga", "Pakur", "Palamu", "Ramgarh", "Ranchi", "Sahibganj", "Seraikela Kharsawan", "Simdega", "West Singhbhum", "Other"],
    "Karnataka": ["Bagalkot", "Ballari", "Belagavi", "Bengaluru Rural", "Bengaluru Urban", "Bidar", "Chamarajanagar", "Chikkaballapur", "Chikkamagaluru", "Chitradurga", "Dakshina Kannada", "Davangere", "Dharwad", "Gadag", "Hassan", "Haveri", "Kalaburagi", "Kodagu", "Kolar", "Koppal", "Mandya", "Mysuru", "Raichur", "Ramanagara", "Shivamogga", "Tumakuru", "Udupi", "Uttara Kannada", "Vijayapura", "Yadgir", "Other"],
    "Kerala": ["Alappuzha", "Ernakulam", "Idukki", "Kannur", "Kasaragod", "Kollam", "Kottayam", "Kozhikode", "Malappuram", "Palakkad", "Pathanamthitta", "Thiruvananthapuram", "Thrissur", "Wayanad", "Other"],
    "Madhya Pradesh": ["Agar Malwa", "Alirajpur", "Anuppur", "Ashoknagar", "Balaghat", "Barwani", "Betul", "Bhind", "Bhopal", "Burhanpur", "Chhatarpur", "Chhindwara", "Damoh", "Datia", "Dewas", "Dhar", "Dindori", "Guna", "Gwalior", "Harda", "Hoshangabad", "Indore", "Jabalpur", "Jhabua", "Katni", "Khandwa", "Khargone", "Mandla", "Mandsaur", "Morena", "Narsinghpur", "Neemuch", "Panna", "Raisen", "Rajgarh", "Ratlam", "Rewa", "Sagar", "Satna", "Sehore", "Seoni", "Shahdol", "Shajapur", "Sheopur", "Shivpuri", "Sidhi", "Singrauli", "Tikamgarh", "Ujjain", "Umaria", "Vidisha", "Other"],
    "Maharashtra": ["Ahmednagar", "Akola", "Amravati", "Aurangabad", "Beed", "Bhandara", "Buldhana", "Chandrapur", "Dhule", "Gadchiroli", "Gondia", "Hingoli", "Jalgaon", "Jalna", "Kolhapur", "Latur", "Mumbai City", "Mumbai Suburban", "Nagpur", "Nanded", "Nandurbar", "Nashik", "Osmanabad", "Palghar", "Parbhani", "Pune", "Raigad", "Ratnagiri", "Sangli", "Satara", "Sindhudurg", "Solapur", "Thane", "Wardha", "Washim", "Yavatmal", "Other"],
    "Manipur": ["Bishnupur", "Chandel", "Churachandpur", "Imphal East", "Imphal West", "Jiribam", "Kakching", "Kamjong", "Kangpokpi", "Noney", "Pherzawl", "Senapati", "Tamenglong", "Tengnoupal", "Thoubal", "Ukhrul", "Other"],
    "Meghalaya": ["East Garo Hills", "East Jaintia Hills", "East Khasi Hills", "North Garo Hills", "Ri Bhoi", "South Garo Hills", "South West Garo Hills", "South West Khasi Hills", "West Garo Hills", "West Jaintia Hills", "West Khasi Hills", "Other"],
    "Mizoram": ["Aizawl", "Champhai", "Kolasib", "Lawngtlai", "Lunglei", "Mamit", "Saiha", "Serchhip", "Other"],
    "Nagaland": ["Dimapur", "Kiphire", "Kohima", "Longleng", "Mokokchung", "Mon", "Peren", "Phek", "Tuensang", "Wokha", "Zunheboto", "Other"],
    "Odisha": ["Angul", "Balangir", "Balasore", "Bargarh", "Bhadrak", "Boudh", "Cuttack", "Deogarh", "Dhenkanal", "Gajapati", "Ganjam", "Jagatsinghpur", "Jajpur", "Jharsuguda", "Kalahandi", "Kandhamal", "Kendrapara", "Kendujhar", "Khordha", "Koraput", "Malkangiri", "Mayurbhanj", "Nabarangpur", "Nayagarh", "Nuapada", "Puri", "Rayagada", "Sambalpur", "Subarnapur", "Sundargarh", "Other"],
    "Punjab": ["Amritsar", "Barnala", "Bathinda", "Faridkot", "Fatehgarh Sahib", "Fazilka", "Ferozepur", "Gurdaspur", "Hoshiarpur", "Jalandhar", "Kapurthala", "Ludhiana", "Mansa", "Moga", "Muktsar", "Nawanshahr", "Pathankot", "Patiala", "Rupnagar", "Sahibzada Ajit Singh Nagar", "Sangrur", "Tarn Taran", "Other"],
    "Rajasthan": ["Ajmer", "Alwar", "Banswara", "Baran", "Barmer", "Bharatpur", "Bhilwara", "Bikaner", "Bundi", "Chittorgarh", "Churu", "Dausa", "Dholpur", "Dungarpur", "Hanumangarh", "Jaipur", "Jaisalmer", "Jalore", "Jhalawar", "Jhunjhunu", "Jodhpur", "Karauli", "Kota", "Nagaur", "Pali", "Pratapgarh", "Rajsamand", "Sawai Madhopur", "Sikar", "Sirohi", "Sri Ganganagar", "Tonk", "Udaipur", "Other"],
    "Sikkim": ["East Sikkim", "North Sikkim", "South Sikkim", "West Sikkim", "Other"],
    "Tamil Nadu": ["Ariyalur", "Chennai", "Coimbatore", "Cuddalore", "Dharmapuri", "Dindigul", "Erode", "Kanchipuram", "Kanyakumari", "Karur", "Krishnagiri", "Madurai", "Nagapattinam", "Namakkal", "Nilgiris", "Perambalur", "Pudukkottai", "Ramanathapuram", "Salem", "Sivaganga", "Thanjavur", "Theni", "Thoothukudi", "Tiruchirappalli", "Tirunelveli", "Tiruppur", "Tiruvallur", "Tiruvannamalai", "Tiruvarur", "Vellore", "Viluppuram", "Virudhunagar", "Other"],
    "Telangana": ["Adilabad", "Bhadradri Kothagudem", "Hyderabad", "Jagtial", "Jangaon", "Jayashankar Bhupalpally", "Jogulamba Gadwal", "Kamareddy", "Karimnagar", "Khammam", "Komaram Bheem", "Mahabubabad", "Mahabubnagar", "Mancherial", "Medak", "Medchal", "Nagarkurnool", "Nalgonda", "Nirmal", "Nizamabad", "Peddapalli", "Rajanna Sircilla", "Rangareddy", "Sangareddy", "Siddipet", "Suryapet", "Vikarabad", "Wanaparthy", "Warangal (Rural)", "Warangal (Urban)", "Yadadri Bhuvanagiri", "Other"],
    "Tripura": ["Dhalai", "Gomati", "Khowai", "North Tripura", "Sepahijala", "South Tripura", "Unakoti", "West Tripura", "Other"],
    "Uttar Pradesh": ["Agra", "Aligarh", "Allahabad", "Ambedkar Nagar", "Amethi", "Amroha", "Auraiya", "Azamgarh", "Baghpat", "Bahraich", "Ballia", "Balrampur", "Banda", "Barabanki", "Bareilly", "Basti", "Bhadohi", "Bijnor", "Budaun", "Bulandshahr", "Chandauli", "Chitrakoot", "Deoria", "Etah", "Etawah", "Faizabad", "Farrukhabad", "Fatehpur", "Firozabad", "Gautam Buddha Nagar", "Ghaziabad", "Ghazipur", "Gonda", "Gorakhpur", "Hamirpur", "Hapur", "Hardoi", "Hathras", "Jalaun", "Jaunpur", "Jhansi", "Kannauj", "Kanpur Dehat", "Kanpur Nagar", "Kasganj", "Kaushambi", "Kheri", "Kushinagar", "Lalitpur", "Lucknow", "Maharajganj", "Mahoba", "Mainpuri", "Mathura", "Mau", "Meerut", "Mirzapur", "Moradabad", "Muzaffarnagar", "Pilibhit", "Pratapgarh", "Raebareli", "Rampur", "Saharanpur", "Sambhal", "Sant Kabir Nagar", "Shahjahanpur", "Shamli", "Shravasti", "Siddharthnagar", "Sitapur", "Sonbhadra", "Sultanpur", "Unnao", "Varanasi", "Other"],
    "Uttarakhand": ["Almora", "Bageshwar", "Chamoli", "Champawat", "Dehradun", "Haridwar", "Nainital", "Pauri Garhwal", "Pithoragarh", "Rudraprayag", "Tehri Garhwal", "Udham Singh Nagar", "Uttarkashi", "Other"],
    "West Bengal": ["Alipurduar", "Bankura", "Birbhum", "Cooch Behar", "Dakshin Dinajpur", "Darjeeling", "Hooghly", "Howrah", "Jalpaiguri", "Jhargram", "Kalimpong", "Kolkata", "Malda", "Murshidabad", "Nadia", "North 24 Parganas", "Paschim Bardhaman", "Paschim Medinipur", "Purba Bardhaman", "Purba Medinipur", "Purulia", "South 24 Parganas", "Uttar Dinajpur", "Other"],
    "Andaman and Nicobar": ["Nicobar", "North and Middle Andaman", "South Andaman", "Other"],
    "Chandigarh": ["Chandigarh", "Other"],
    "Dadra and Nagar Haveli": ["Dadra and Nagar Haveli", "Other"],
    "Daman and Diu": ["Daman", "Diu", "Other"],
    "Delhi": ["Central Delhi", "East Delhi", "New Delhi", "North Delhi", "North East Delhi", "North West Delhi", "Shahdara", "South Delhi", "South East Delhi", "South West Delhi", "West Delhi", "Other"],
    "Jammu and Kashmir": ["Anantnag", "Bandipora", "Baramulla", "Budgam", "Doda", "Ganderbal", "Jammu", "Kathua", "Kishtwar", "Kulgam", "Kupwara", "Poonch", "Pulwama", "Rajouri", "Ramban", "Reasi", "Samba", "Shopian", "Srinagar", "Udhampur", "Other"],
    "Ladakh": ["Kargil", "Leh", "Other"],
    "Lakshadweep": ["Lakshadweep", "Other"],
    "Puducherry": ["Karaikal", "Mahe", "Puducherry", "Yanam", "Other"],
    "Other": ["Other"]
  };

  // --- STATES ---
  const [orgName, setOrgName] = useState('');
  const [customerGroup, setCustomerGroup] = useState('Select');
  const [beds, setBeds] = useState('Select');
  const [salutation, setSalutation] = useState('Select');
  const [country, setCountry] = useState('India'); 
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [address1, setAddress1] = useState('');
  const [address2, setAddress2] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [pincode, setPincode] = useState('');
  
  // State Logic
  const [selectedState, setSelectedState] = useState('Select');
  const [isManualState, setIsManualState] = useState(false);

  // District Logic
  const [selectedDistrict, setSelectedDistrict] = useState('Select');
  const [districtList, setDistrictList] = useState<string[]>([]);
  const [isManualDistrict, setIsManualDistrict] = useState(false);

  const [designation, setDesignation] = useState('Select');
  const [territory, setTerritory] = useState('Select');

  // --- MODAL STATES ---
  const [modalVisible, setModalVisible] = useState(false);
  const [currentModalType, setCurrentModalType] = useState('');
  const [modalData, setModalData] = useState<string[]>([]);
  
  // 🔥 Search inside Modal
  const [modalSearchText, setModalSearchText] = useState('');
  const [filteredModalData, setFilteredModalData] = useState<string[]>([]);

  // --- OPTIONS ---
  const customerGroupOptions = [
    "Conference/Exhibition", "Dealer", "Free Lancer/Reseller", "Govt Hospital", 
    "Govt Medical College", "Military Hospital", "Railway Hospital", 
    "Private Corporate Hospital", "Private Hospital", "Private Medical College", 
    "Private Non Profit Hospital", "Others"
  ];
  const bedsOptions = ["0-50", "50-100", "100-200", "Above 200"];
  const salutationOptions = ["Dr.", "Mr.", "Mrs.", "Ms.", "Prof."];
  const countryOptions = ["India", "USA", "UK", "UAE", "Others"];
  const designationOptions = [
    "Secretary", "Associate", "Business Development Manager", "Project Manager", 
    "Head of Marketing and Sales", "Executive-Sales", "Sales & Service Engineer", 
    "Executive-Accounts/Taxation", "Supervisor-Production", "BME", 
    "Business Development Officer", "Application Engineer", "Administrative Officer"
  ];
  const territoryOptions = ["North", "South", "East", "West", "Central"];

  // --- AUTO FILL (EDIT MODE) ---
  useEffect(() => {
      if (isEditMode) {
          const orgToEdit = orgList.find((o: any) => o.id === params.editId);
          if (orgToEdit) {
              setOrgName(orgToEdit.name);
              setCustomerGroup(orgToEdit.type);
              setBeds(orgToEdit.beds || 'Select');
              setCity(orgToEdit.city);
              setAddress1(orgToEdit.address1 || '');
              setAddress2(orgToEdit.address2 || '');
              setMobile(orgToEdit.mobile || '');
              setEmail(orgToEdit.email || '');
              setPincode(orgToEdit.pincode || '');
              
              setSalutation(orgToEdit.salutation || 'Select');
              setFirstName(orgToEdit.firstName || '');
              setLastName(orgToEdit.lastName || '');
              
              if(orgToEdit.state && stateDistrictData[orgToEdit.state]) {
                  setSelectedState(orgToEdit.state);
                  setDistrictList(stateDistrictData[orgToEdit.state]);
              } else {
                  setSelectedState('Select');
              }
              setSelectedDistrict(orgToEdit.district || 'Select');
              setDesignation(orgToEdit.designation || 'Select');
              setTerritory(orgToEdit.territory || 'Select');
          }
      }
  }, [isEditMode]);

  // --- OPEN MODAL ---
  const openModal = (type: string, data: any[]) => {
    setCurrentModalType(type);
    setModalData(data);
    setFilteredModalData(data); // Initial List
    setModalSearchText('');
    setModalVisible(true);
  };

  // --- SEARCH IN MODAL ---
  const handleModalSearch = (text: string) => {
      setModalSearchText(text);
      if (text) {
          const newData = modalData.filter(item => item.toLowerCase().includes(text.toLowerCase()));
          setFilteredModalData(newData);
      } else {
          setFilteredModalData(modalData);
      }
  };

  // --- HANDLE SELECTION ---
  const handleSelect = (item: string) => {
    switch (currentModalType) {
      case 'Customer Group': setCustomerGroup(item); break;
      case 'Beds': setBeds(item); break;
      case 'Salutation': setSalutation(item); break;
      case 'Country': setCountry(item); break;
      
      case 'State': 
        if (item === 'Other') { setIsManualState(true); setSelectedState(''); setDistrictList([]); } 
        else { setIsManualState(false); setSelectedState(item); setDistrictList(stateDistrictData[item] || ['Other']); setSelectedDistrict('Select'); setIsManualDistrict(false); }
        break;

      case 'District':
        if (item === 'Other') { setIsManualDistrict(true); setSelectedDistrict(''); } 
        else { setIsManualDistrict(false); setSelectedDistrict(item); }
        break;

      case 'Designation': setDesignation(item); break;
      case 'Territory': setTerritory(item); break;
    }
    setModalVisible(false);
  };

  // --- SAVE ORGANIZATION ---
  // --- SAVE ORGANIZATION ---
  const handleSave = async () => {
      if (!orgName || customerGroup === 'Select' || selectedState === 'Select') {
          Alert.alert("Missing Fields", "Please fill Organization, Customer Group and State.");
          return;
      }

      const orgData = {
          name: orgName,
          orgName: orgName, 
          type: customerGroup,
          city: city || selectedDistrict, 
          equipment: { ventilator: 0, anesthesia: 0, bubble: 0, compressor: 0, monitor: 0 },
          
          beds, 
          address1, 
          address: address1, 
          address2,
          salutation, firstName, lastName,
          mobile, email, state: selectedState, district: selectedDistrict,
          designation, territory, pincode,
          contactPerson: `${salutation} ${firstName} ${lastName}`,
          
          senderId: user?.uid || 'guest',
          senderName: user?.name || 'Unknown',
          role: user?.role || 'Employee',
          createdAt: new Date().toISOString()
      };

      if (isEditMode) {
          updateOrganization(params.editId, orgData);
          Alert.alert("Updated", "Organization details updated!");
      } else {
          // ❌ OLD ERROR LINE: addOrganization({ id: Date.now().toString(), ...orgData });
          
          // ✅ CORRECT LINE (Do not send ID, Firebase will generate it)
          addOrganization(orgData); 
          
          Alert.alert("Success", "Organization Added!");
      }
      router.back();
  };

  return (
    // 🔥 1. Wrapped everything in KeyboardAvoidingView
    <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Organization' : 'New Organization'}</Text>
          <View style={{width:24}} /> 
        </View>

        {/* 🔥 2. ScrollView Wrapper */}
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            
            <Text style={styles.label}>Organization *</Text>
            <TextInput style={styles.inputGray} value={orgName} onChangeText={setOrgName} placeholder="Enter Hospital Name" />

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Customer Group *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Customer Group', customerGroupOptions)}>
                        <Text style={{color: customerGroup === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{customerGroup}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Beds *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Beds', bedsOptions)}>
                        <Text style={{color: beds === 'Select' ? 'gray' : 'black'}}>{beds}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Address Line 1 *</Text>
                    <TextInput style={styles.inputGray} value={address1} onChangeText={setAddress1} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Salutation *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Salutation', salutationOptions)}>
                        <Text style={{color: salutation === 'Select' ? 'gray' : 'black'}}>{salutation}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Address Line 2</Text>
                    <TextInput style={styles.inputGray} value={address2} onChangeText={setAddress2} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>First Name *</Text>
                    <TextInput style={styles.inputGray} value={firstName} onChangeText={setFirstName} />
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Country *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Country', countryOptions)}>
                        <Text style={{fontWeight: country === 'India' ? 'bold' : 'normal', color: 'black'}}>{country}</Text>
                        <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Last Name</Text>
                    <TextInput style={styles.inputGray} value={lastName} onChangeText={setLastName} />
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>State *</Text>
                    {isManualState ? (
                        <View style={styles.manualInputContainer}>
                            <TextInput style={styles.manualInput} placeholder="Type State" onChangeText={setSelectedState} />
                            <TouchableOpacity onPress={() => setIsManualState(false)}><Ionicons name="close-circle" size={20} color="red" /></TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity style={styles.dropdown} onPress={() => openModal('State', Object.keys(stateDistrictData))}>
                            <Text style={{color: selectedState === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{selectedState}</Text>
                            <Ionicons name="caret-down" size={14} color="gray" />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Mobile No</Text>
                    <TextInput style={styles.inputGray} keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>District *</Text>
                    {isManualDistrict ? (
                        <View style={styles.manualInputContainer}>
                            <TextInput style={styles.manualInput} placeholder="Type District" onChangeText={setSelectedDistrict} />
                            <TouchableOpacity onPress={() => setIsManualDistrict(false)}><Ionicons name="close-circle" size={20} color="red" /></TouchableOpacity>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            style={[styles.dropdown, {backgroundColor: selectedState === 'Select' ? '#f0f0f0' : '#e8e8e8'}]} 
                            onPress={() => {
                                if (selectedState !== 'Select') openModal('District', districtList);
                                else Alert.alert("Wait", "Please select a State first.");
                            }}
                        >
                            <Text style={{color: selectedDistrict === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{selectedDistrict}</Text>
                            <Ionicons name="caret-down" size={14} color="gray" />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Phone (Optional)</Text>
                    <TextInput style={styles.inputGray} keyboardType="phone-pad" />
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>City/Tehsil *</Text>
                    <TextInput style={styles.inputGray} placeholder="Type City" value={city} onChangeText={setCity} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Email Address</Text>
                    <TextInput style={styles.inputGray} keyboardType="email-address" value={email} onChangeText={setEmail} />
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Pincode *</Text>
                    <TextInput style={styles.inputGray} keyboardType="number-pad" value={pincode} onChangeText={setPincode} />
                </View>
                <View style={styles.col}>
                    <Text style={styles.label}>Designation</Text>
                      <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Designation', designationOptions)}>
                          <Text style={{color: designation === 'Select' ? 'gray' : 'black'}} numberOfLines={1}>{designation}</Text>
                          <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.row}>
                <View style={styles.col}>
                    <Text style={styles.label}>Territory *</Text>
                    <TouchableOpacity style={styles.dropdown} onPress={() => openModal('Territory', territoryOptions)}>
                          <Text style={{color: territory === 'Select' ? 'gray' : 'black'}}>{territory}</Text>
                          <Ionicons name="caret-down" size={14} color="gray" />
                    </TouchableOpacity>
                </View>
            </View>

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveBtnText}>{isEditMode ? 'Update' : 'Save'}</Text>
            </TouchableOpacity>
            
            <View style={{height:50}} />
        </ScrollView>
        {/* --- REUSABLE DROPDOWN MODAL WITH SEARCH --- */}
        <Modal visible={modalVisible} transparent={true} animationType="fade">
            
            {/* 1. KeyboardAvoidingView wrapper */}
            <KeyboardAvoidingView 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
                style={{flex: 1}}
            >
                {/* 2. TouchableOpacity (Overlay) - SCROLLVIEW HATA DIYA HAI */}
                <TouchableOpacity 
                    style={styles.modalOverlay} 
                    onPress={() => setModalVisible(false)} 
                    activeOpacity={1}
                >
                    {/* 3. Modal Content */}
                    <View 
                        style={styles.modalContent} 
                        onStartShouldSetResponder={() => true}
                    >
                        <Text style={styles.modalTitle}>Select {currentModalType}</Text>
                        
                        <View style={styles.modalSearchBox}>
                            <Ionicons name="search" size={20} color="gray" />
                            <TextInput 
                                style={{flex:1, marginLeft:10}} 
                                placeholder="Search..." 
                                value={modalSearchText}
                                onChangeText={handleModalSearch}
                            />
                        </View>

                        {/* 4. FlatList (Ab ye ScrollView ke andar nahi hai, to Error nahi aayega) */}
                        <FlatList 
                            data={filteredModalData}
                            keyExtractor={(item, index) => index.toString()}
                            renderItem={({item}: any) => (
                                <TouchableOpacity style={styles.modalItem} onPress={() => handleSelect(item)}>
                                    <Text style={styles.modalItemText}>{item}</Text>
                                </TouchableOpacity>
                            )}
                            ListEmptyComponent={<Text style={{textAlign:'center', marginTop:20, color:'gray'}}>No matches found</Text>}
                            style={{maxHeight: 300}} // Height limit jaruri hai
                        />
                    </View>
                </TouchableOpacity>
            </KeyboardAvoidingView>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, alignItems: 'center', backgroundColor: 'white', paddingTop: 50 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#3b5998' },
  scrollContent: { padding: 20, paddingBottom: 100 }, // 🔥 Cleaned up styles
  searchBox: { flexDirection:'row', alignItems:'center', borderWidth:1, borderColor:'#3b5998', borderRadius:30, paddingHorizontal:15, paddingVertical:10, marginBottom:20 },
  label: { marginBottom: 5, color:'#aaa', fontWeight:'600', fontSize:14 },
  inputGray: { backgroundColor: '#e8e8e8', borderRadius: 8, padding: 12, marginBottom: 15, height: 50 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { width: '48%' },
  dropdown: { backgroundColor: '#e8e8e8', borderRadius: 8, padding: 12, marginBottom: 15, flexDirection:'row', justifyContent:'space-between', alignItems:'center', height:50 },
  manualInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8e8e8', borderRadius: 8, marginBottom: 15, paddingHorizontal: 10, height: 50 },
  manualInput: { flex: 1, fontSize: 14, color: 'black' },
  saveButton: { backgroundColor: '#3b5998', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: 'white', borderRadius: 10, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', color: '#3b5998' },
  modalSearchBox: { flexDirection:'row', alignItems:'center', backgroundColor:'#f0f0f0', borderRadius:8, padding:10, marginBottom:10 },
  modalItem: { paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalItemText: { fontSize: 16, color: '#333' }
});