import React, { useEffect, useState } from "react";
import { SafeAreaView, View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import * as BarcodeScanner from 'expo-barcode-scanner';
import * as ImagePicker from 'expo-image-picker';

const API_BASE = "http://10.0.2.2:4000"; // change for your environment

export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [actions, setActions] = useState([]);
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');

  useEffect(() => {
    (async () => {
      const perm = await BarcodeScanner.requestPermissionsAsync();
      setHasPermission(perm.status === 'granted');
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let res = await fetch(`${API_BASE}/auth/dev-login`, { method: "POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ phone: phoneInput || undefined }) });
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        const a = await (await fetch(`${API_BASE}/feed`)).json();
        setActions(a.actions || []);
        const o = await (await fetch(`${API_BASE}/rewards`)).json();
        setOffers(o.offers || []);
      } catch (e) {
        alert("API error: " + e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [phoneInput]);

  async function pickAndUpload(actionId) {
    try {
      const imgPerm = await ImagePicker.requestCameraPermissionsAsync();
      if (!imgPerm.granted) { alert('Camera permission required'); return; }

      const result = await ImagePicker.launchCameraAsync({ quality: 0.6, base64: false });
      if (result.cancelled) return;

      // get presign from server
      const filename = result.uri.split('/').pop();
      const pres = await (await fetch(`${API_BASE}/uploads/presign`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ filename, token }) })).json();
      if (!pres.url) throw new Error('Presign failed');

      // upload file via PUT to the returned URL (the server expects multipart PUT handled by multer)
      const localUri = result.uri;
      const formData = new FormData();
      const parts = localUri.split('/');
      const name = parts[parts.length-1];
      const file = { uri: localUri, name, type: 'image/jpeg' };
      formData.append('file', file);
      // use fetch to upload as POST to our upload receiver
      const up = await fetch(pres.url, { method: 'PUT', body: formData });
      const upj = await up.json();
      if (!up.ok) throw new Error(upj.error || 'Upload failed');

      // submit action referencing the uploaded key
      const payload = { key: upj.key };
      const sub = await (await fetch(`${API_BASE}/submission`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ token, action_id: actionId, payload }) })).json();
      if (!sub) throw new Error(sub.error || 'Submission error');
      alert('Uploaded and submitted. New points: ' + sub.new_points);
      const imp = await (await fetch(`${API_BASE}/impact?token=${token}`)).json();
      setUser(prev => ({...prev, points: imp.points}));
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function quickVerify(actionId) {
    try {
      const res = await fetch(`${API_BASE}/submission`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ token, action_id: actionId, payload: { demo: true } })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || JSON.stringify(j));
      alert("Action approved! New points: " + j.new_points);
      const imp = await (await fetch(`${API_BASE}/impact?token=${token}`)).json();
      setUser(prev => ({...prev, points: imp.points}));
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  async function redeemOffer(offerId) {
    try {
      const res = await fetch(`${API_BASE}/redeem`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ token, offer_id: offerId })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || JSON.stringify(j));
      alert("Redemption code: " + j.redemption.code + "\nShow to merchant to validate with their PIN.");
      const imp = await (await fetch(`${API_BASE}/impact?token=${token}`)).json();
      setUser(prev => ({...prev, points: imp.points}));
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  const handleBarCodeScanned = ({ type, data }) => {
    setScanned(true);
    alert(`Scanned data: ${data}`);
  };

  if (loading) return <SafeAreaView style={s.center}><ActivityIndicator/></SafeAreaView>;

  return (
    <SafeAreaView style={s.container}>
      <Text style={s.h}>GreenLoop — Upload Demo</Text>
      <Text style={s.sub}>User: {user?.name} • Points: {user?.points}</Text>

      <View style={{marginVertical:8}}>
        <TextInput placeholder="Optional: enter phone to create user" value={phoneInput} onChangeText={setPhoneInput} style={{borderWidth:1,borderColor:'#e2e8f0',padding:8,borderRadius:8}}/>
      </View>

      <Text style={s.section}>Actions (use camera upload)</Text>
      <FlatList data={actions} keyExtractor={i=>i.id} renderItem={({item}) => (
        <View style={s.card}>
          <Text style={s.cardTitle}>{item.title}</Text>
          <Text>{item.points} pts • {item.verification}</Text>
          <View style={{flexDirection:'row',gap:8}}>
            <TouchableOpacity style={s.btn} onPress={()=>pickAndUpload(item.id)}>
              <Text style={s.btnText}>Take Photo & Submit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.btn, {backgroundColor:'#0b74de'}]} onPress={()=>quickVerify(item.id)}>
              <Text style={s.btnText}>Quick Verify</Text>
            </TouchableOpacity>
          </View>
        </View>
      )} />

      <Text style={s.section}>Rewards</Text>
      <FlatList data={offers} keyExtractor={i=>i.id} renderItem={({item}) => (
        <View style={s.card}>
          <Text style={s.cardTitle}>{item.title}</Text>
          <Text>{item.merchant}</Text>
          <TouchableOpacity style={s.btn} onPress={()=>redeemOffer(item.id)}>
            <Text style={s.btnText}>Redeem</Text>
          </TouchableOpacity>
        </View>
      )} />

      <Text style={s.section}>QR Scanner (demo)</Text>
      {hasPermission === false ? <Text>No camera permission</Text> : (
        <View style={{height:200}}>
          <BarcodeScanner.BarCodeScanner onBarCodeScanned={scanned ? undefined : handleBarCodeScanned} style={{flex:1}} />
        </View>
      )}
      {scanned && <TouchableOpacity onPress={()=>setScanned(false)} style={{marginTop:8}}><Text>Tap to scan again</Text></TouchableOpacity>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:{ flex:1, padding:16, backgroundColor:"#F8FAFC" },
  h:{ fontSize:22, fontWeight:"700", marginBottom:4 },
  sub:{ marginBottom:12, color:"#475569" },
  section:{ marginTop:12, fontWeight:"700" },
  card:{ backgroundColor:"#fff", padding:12, borderRadius:10, marginVertical:8, borderWidth:1, borderColor:"#E2E8F0" },
  cardTitle:{ fontWeight:"700" },
  btn:{ marginTop:8, padding:10, backgroundColor:"#00A86B", borderRadius:8, alignSelf:"flex-start", marginRight:10 },
  btnText:{ color:"#fff", fontWeight:"700" },
  center:{ flex:1, justifyContent:"center", alignItems:"center" }
});
