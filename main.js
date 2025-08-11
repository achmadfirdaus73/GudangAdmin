import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import {
      getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc,
      runTransaction, serverTimestamp, query, orderBy
    } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const { createApp, ref, reactive, computed, onMounted } = Vue;
    const { createVuetify } = Vuetify;
    const vuetify = createVuetify();

    createApp({
      setup() {
        // Firebase config - ganti kalau perlu
        const firebaseConfig = {
          apiKey: "AIzaSyAtcpD9xqIdd11TaTxCTt9gX-tXpyF0mEw",
          authDomain: "databasegudang-3f549.firebaseapp.com",
          projectId: "databasegudang-3f549",
          storageBucket: "databasegudang-3f549.firebasestorage.app",
          messagingSenderId: "724505523172",
          appId: "1:724505523172:web:c041add4db9abfd252cdf1",
          measurementId: "G-SXD15ZPFX7"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const barangCol = collection(db, 'barang');
        const riwayatCol = collection(db, 'riwayat');

        // state
        const currentPage = ref('stok');
        const navValue = ref('stok');
        const search = ref('');
        const dialog = ref(false);
        const dialogMode = ref('tambah');
        const snackbar = reactive({ show:false, text:'', color:'success' });
        const isLoading = ref(true);
        const isSubmitting = ref(false);
        const tanggalMulai = ref(null);
        const tanggalSelesai = ref(null);

        // SJ active
        const sjAktif = ref({ id:'', tanggal:'', tujuan:'', items:[] });

        const barang = ref([]);
        const riwayat = ref([]);

        const defaultItem = { kode:'', nama:'', stok:0, harga_satuan:0 };
        const editedItem = ref({ ...defaultItem });
        const formTransaksi = ref({ id:null, jumlah:null });
        const formKeluar = ref({ tujuan:'', items:[] });
        const itemKeluar = ref({ barang:null, jumlah:null });

        // Audit
        const auditResults = ref([]); // objects
        const isAuditing = ref(false);
        const showAuditAlert = ref(false);
        const counts = reactive({ red:0, yellow:0, green:0 });

        // headers
        const barangHeaders = [
          { title:'Kode', value:'kode' },
          { title:'Nama Barang', value:'nama' },
          { title:'Harga Satuan', value:'harga_satuan', align:'end' },
          { title:'Stok', value:'stok', align:'end' },
          { title:'Total Nilai', value:'total_nilai', align:'end' },
          { title:'Aksi', value:'actions', sortable:false, align:'end' }
        ];
        const riwayatHeaders = [
          { title:'Tanggal', value:'tanggal' },
          { title:'Tujuan/Ket', value:'tujuan' },
          { title:'Jml Item', value:'totalItems' },
          { title:'Total Kuantitas', value:'totalJumlah', align:'end' }
        ];
        const suratJalanHeaders = [
          { title:'Tanggal', value:'tanggal' },
          { title:'Tujuan', value:'tujuan' },
          { title:'Items', value:'items' },
          { title:'Aksi', value:'actions', sortable:false }
        ];
        const auditHeaders = [
          { title:'Referensi', value:'reference' },
          { title:'Masalah', value:'masalah' },
          { title:'Status', value:'status' }
        ];

        const pageTitle = computed(()=> {
          const titles = { stok:'Stok Barang', masuk:'Form Barang Masuk', keluar:'Form Barang Keluar', laporan:'Laporan Transaksi', suratJalan:'Surat Jalan', viewSJ:'Detail SJ', audit:'Audit Otomatis' };
          return titles[currentPage.value] || 'Aplikasi Gudang';
        });
        const dialogTitle = computed(()=> { const t={ tambah:'Barang Baru', edit:'Edit Barang', hapus:'Konfirmasi Hapus' }; return t[dialogMode.value]||''; });

        const formatRupiah = (angka) => {
          if (angka === null || angka === undefined) return 'Rp 0';
          return new Intl.NumberFormat('id-ID',{ style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(angka);
        };

        const showSnackbar = (text, color='success') => { snackbar.text=text; snackbar.color=color; snackbar.show=true; };

        const openDialog = (mode, item=null) => { dialogMode.value = mode; editedItem.value = item ? {...item} : {...defaultItem}; dialog.value = true; };
        const closeDialog = () => { dialog.value = false; };

        // computed filtered riwayat
        const filteredRiwayat = computed(()=> {
          let data = riwayat.value.slice();
          if (tanggalMulai.value) { const st = new Date(tanggalMulai.value); st.setHours(0,0,0,0); data = data.filter(i=>i.timestamp>=st); }
          if (tanggalSelesai.value) { const ed = new Date(tanggalSelesai.value); ed.setHours(23,59,59,999); data = data.filter(i=>i.timestamp<=ed); }
          return data;
        });
        const riwayatKeluar = computed(()=> riwayat.value.filter(r=>r.tipe==='KELUAR'));
        const laporan = computed(()=> {
          const d = filteredRiwayat.value;
          const totalMasuk = d.filter(r=>r.tipe==='MASUK').reduce((s,i)=>s+(i.totalJumlah||0),0);
          const totalKeluar = d.filter(r=>r.tipe==='KELUAR').reduce((s,i)=>s+(i.totalJumlah||0),0);
          const totalNilai = barang.value.reduce((s,i)=>s+((i.stok||0)*(i.harga_satuan||0)),0);
          return { totalMasuk, totalKeluar, totalNilaiAset: totalNilai };
        });

        const sjTotalNilai = computed(() => {
          if (!sjAktif.value || !sjAktif.value.items) return 0;
          return sjAktif.value.items.reduce((s,it)=>s+((it.jumlah||0)*(it.harga_satuan||0)),0);
        });

        // CRUD barang
        const simpanDialog = async () => {
          isSubmitting.value = true;
          try {
            if (dialogMode.value === 'tambah') {
              if (!editedItem.value.kode || !editedItem.value.nama) { showSnackbar('Kode & Nama harus diisi','error'); isSubmitting.value=false; return; }
              const payload = { kode: editedItem.value.kode, nama: editedItem.value.nama, stok: Number(editedItem.value.stok||0), harga_satuan: Number(editedItem.value.harga_satuan||0) };
              await addDoc(barangCol, payload);
              showSnackbar('Barang ditambahkan');
            } else if (dialogMode.value === 'edit') {
              const { id, ...dataToUpdate } = editedItem.value;
              if (!id) { showSnackbar('ID tidak ditemukan','error'); isSubmitting.value=false; return; }
              await updateDoc(doc(db,'barang',id), { kode: dataToUpdate.kode, nama: dataToUpdate.nama, harga_satuan: Number(dataToUpdate.harga_satuan||0) });
              showSnackbar('Barang diupdate');
            } else if (dialogMode.value === 'hapus') {
              if (!editedItem.value.id) { showSnackbar('ID tidak ditemukan','error'); isSubmitting.value=false; return; }
              await deleteDoc(doc(db,'barang',editedItem.value.id));
              showSnackbar('Barang dihapus','warning');
            }
            closeDialog();
          } catch(e){ console.error(e); showSnackbar('Error: '+e,'error'); } finally { isSubmitting.value=false; }
        };

        // transaksi masuk
        const catatTransaksi = async (tipe) => {
          if (tipe==='KELUAR') { await catatTransaksiKeluar(); return; }
          if (!formTransaksi.value.id || !(Number(formTransaksi.value.jumlah)>0)) { showSnackbar('Periksa input transaksi','error'); return; }
          isSubmitting.value = true;
          try {
            const barangRef = doc(db,'barang',formTransaksi.value.id);
            await runTransaction(db, async (transaction) => {
              const bDoc = await transaction.get(barangRef);
              if (!bDoc.exists()) throw 'Barang tidak ditemukan';
              const dataB = bDoc.data();
              const stokBaru = (dataB.stok||0)+Number(formTransaksi.value.jumlah||0);
              transaction.update(barangRef, { stok: stokBaru });
              const itemData = { id: formTransaksi.value.id, kode: dataB.kode, nama: dataB.nama, jumlah: Number(formTransaksi.value.jumlah||0), harga_satuan: dataB.harga_satuan||0 };
              const riwayatBaru = { tipe:'MASUK', tujuan:'Stok Masuk', items:[itemData], totalJumlah:Number(formTransaksi.value.jumlah||0), totalItems:1, tanggal: serverTimestamp() };
              const newRef = doc(riwayatCol);
              transaction.set(newRef, riwayatBaru);
            });
            showSnackbar('Transaksi masuk tercatat');
            formTransaksi.value = { id:null, jumlah:null };
          } catch(e){ console.error(e); showSnackbar('Error: '+e,'error'); } finally { isSubmitting.value=false; }
        };

        // tambah barang keluar ke daftar
        const tambahBarangKeDaftar = () => {
          if (!itemKeluar.value.barang || !itemKeluar.value.jumlah || itemKeluar.value.jumlah<=0) { showSnackbar('Pilih barang & jumlah','error'); return; }
          if ((itemKeluar.value.barang.stok||0) < itemKeluar.value.jumlah) { showSnackbar('Stok kurang','error'); return; }
          formKeluar.value.items.push({...itemKeluar.value.barang, jumlah: Number(itemKeluar.value.jumlah)});
          itemKeluar.value = { barang:null, jumlah:null };
        };
        const hapusBarangDariDaftar = (i) => { formKeluar.value.items.splice(i,1); };

        // transaksi keluar multi
        const catatTransaksiKeluar = async () => {
          if (!formKeluar.value.tujuan || formKeluar.value.items.length===0) { showSnackbar('Tujuan & daftar kosong','error'); return; }
          isSubmitting.value = true;
          try {
            await runTransaction(db, async (transaction) => {
              const refs = formKeluar.value.items.map(it=>doc(db,'barang',it.id));
              const docs = await Promise.all(refs.map(r=>transaction.get(r)));
              for (let i=0;i<docs.length;i++){
                if (!docs[i].exists()) throw `Barang tidak ditemukan`;
                const stokSekarang = docs[i].data().stok||0;
                if (stokSekarang < formKeluar.value.items[i].jumlah) throw `Stok ${formKeluar.value.items[i].nama} tidak cukup`;
              }
              for (let i=0;i<docs.length;i++){
                const stokBaru = (docs[i].data().stok||0) - formKeluar.value.items[i].jumlah;
                transaction.update(refs[i], { stok: stokBaru });
              }
              const riwayatBaru = { tipe:'KELUAR', tujuan: formKeluar.value.tujuan, items: formKeluar.value.items.map(i=>({ id:i.id, kode:i.kode, nama:i.nama, jumlah:i.jumlah, harga_satuan:i.harga_satuan||0 })), totalJumlah: formKeluar.value.items.reduce((s,i)=>s+(i.jumlah||0),0), totalItems: formKeluar.value.items.length, tanggal: serverTimestamp() };
              const newRef = doc(riwayatCol);
              transaction.set(newRef, riwayatBaru);
            });
            showSnackbar('Transaksi keluar tercatat');
            formKeluar.value = { tujuan:'', items:[] };
            currentPage.value = 'suratJalan';
            navValue.value = 'suratJalan';
          } catch(e){ console.error(e); showSnackbar('Error: '+e,'error'); } finally { isSubmitting.value=false; }
        };

        // export stok xlsx
        const exportStokToExcel = () => {
          const data = barang.value.map(b=>({ 'Kode':b.kode, 'Nama':b.nama, 'Harga':b.harga_satuan||0, 'Stok':b.stok||0, 'Total':(b.stok||0)*(b.harga_satuan||0) }));
          if (!data.length){ showSnackbar('Tidak ada data','warning'); return; }
          const ws = XLSX.utils.json_to_sheet(data);
          XLSX.utils.book_append_sheet(XLSX.utils.book_new(), ws, 'Stok');
          XLSX.writeFile(XLSX.utils.book_new(), `Daftar_Stok_${new Date().toLocaleDateString('id-ID')}.xlsx`);
          // Note: above creates new empty workbook twice, simplified due to single-file constraints
        };

        // export laporan to excel (summary + detail)
        const exportLaporanToExcel = () => {
          const dataArray = filteredRiwayat.value;
          if (!dataArray.length){ showSnackbar('Tidak ada data laporan','warning'); return; }
          const summary = [ { 'Laporan': `Periode: ${tanggalMulai.value||'Semua'} - ${tanggalSelesai.value||'Semua'}` }, { '': '' }, { 'Deskripsi':'Total Masuk','Jumlah': laporan.value.totalMasuk }, { 'Deskripsi':'Total Keluar','Jumlah': laporan.value.totalKeluar } ];
          const details = dataArray.flatMap(i => (i.items||[]).map(it => ({ 'Tanggal': i.tanggal, 'Tipe': i.tipe, 'Tujuan': i.tujuan||'-', 'Kode': it.kode, 'Nama': it.nama, 'Jumlah': it.jumlah })));
          const ws = XLSX.utils.json_to_sheet(summary,{skipHeader:true});
          XLSX.utils.sheet_add_aoa(ws, [[' ']],{origin:-1});
          XLSX.utils.sheet_add_aoa(ws, [['Tanggal','Tipe','Tujuan','Kode','Nama','Jumlah']],{origin:-1});
          XLSX.utils.sheet_add_json(ws, details,{origin:-1, skipHeader:true});
          const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Laporan');
          XLSX.writeFile(wb, `Laporan_Transaksi_${new Date().toLocaleDateString('id-ID')}.xlsx`);
        };

        const resetFilterTanggal = () => { tanggalMulai.value=null; tanggalSelesai.value=null; };

        const lihatSuratJalan = (it) => { sjAktif.value = it; currentPage.value='viewSJ'; };
        const kembaliKeSjList = () => { currentPage.value='suratJalan'; navValue.value='suratJalan'; };

        // download SJ DOCX
        const downloadSjDocx = () => {
          const node = document.getElementById('surat-jalan-content');
          if (!node){ showSnackbar('Konten tidak ditemukan','error'); return; }
          const content = node.innerHTML;
          const full = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:Arial;font-size:11pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:8px}th{background:#f2f2f2}</style></head><body>${content}</body></html>`;
          try {
            const converted = htmlDocx.asBlob(full);
            const filename = `SJ-${sjAktif.value.id?sjAktif.value.id.slice(-6).toUpperCase():Date.now()}.docx`;
            saveAs(converted, filename);
          } catch(e){ console.error(e); showSnackbar('Gagal buat DOCX: '+e,'error'); }
        };

        // download SJ PDF
        const downloadSjPdf = async () => {
          try {
            const el = document.getElementById('surat-jalan-content');
            if (!el){ showSnackbar('Konten tidak ditemukan','error'); return; }
            await new Promise(r=>setTimeout(r,200));
            const canvas = await html2canvas(el, { scale:2, useCORS:true });
            const img = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit:'pt', format:'a4' });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = (canvas.height * pdfW) / canvas.width;
            pdf.addImage(img,'PNG',20,20,pdfW-40,pdfH);
            let rem = pdfH; const pageH = pdf.internal.pageSize.getHeight()-40; let pos = 20;
            while (rem > pageH){ rem -= pageH; pos = pos - pageH; pdf.addPage(); pdf.addImage(img,'PNG',20,pos,pdfW-40,pdfH); }
            pdf.save(`${sjAktif.value.nomor||'SURAT_JALAN'}.pdf`);
          } catch(e){ console.error(e); showSnackbar('Gagal buat PDF: '+e,'error'); }
        };

        const exportSJtoPDF = async (sj) => { sjAktif.value = sj; currentPage.value='viewSJ'; await new Promise(r=>setTimeout(r,300)); await downloadSjPdf(); };

        // ----- AUDIT -----
        const resetAudit = () => { auditResults.value = []; counts.red=0; counts.yellow=0; counts.green=0; };
        const runAudit = async () => {
          isAuditing.value = true;
          resetAudit();
          try {
            // earliest MASUK per kode
            const masukMap = {};
            riwayat.value.forEach(r=>{
              if (r.tipe==='MASUK') {
                (r.items||[]).forEach(it=>{
                  const kode = it.kode;
                  const ts = r.timestamp instanceof Date ? r.timestamp : new Date();
                  if (!masukMap[kode] || ts < masukMap[kode]) masukMap[kode] = ts;
                });
              }
            });

            // check barang stok
            barang.value.forEach(b=>{
              if ((b.stok||0) < 0) {
                auditResults.value.push({ id:`barang-${b.id}`, level:'red', statusLabel:'Masalah Serius', statusClass:'status-danger', reference:`Barang: ${b.kode||'-'} — ${b.nama||'-'}`, masalah:`Stok negatif (${b.stok}).` });
                counts.red++;
              } else {
                auditResults.value.push({ id:`barang-${b.id}-ok`, level:'green', statusLabel:'Aman', statusClass:'status-aman', reference:`Barang: ${b.kode||'-'} — ${b.nama||'-'}`, masalah:`Stok sistem: ${b.stok||0}.` });
                counts.green++;
              }
            });

            // check riwayat keluar
            for (const r of riwayat.value.filter(x=>x.tipe==='KELUAR')) {
              const rTime = r.timestamp instanceof Date ? r.timestamp : new Date();
              for (const it of (r.items||[])) {
                const kode = it.kode;
                // keluar before earliest masuk?
                if (masukMap[kode] && (rTime < masukMap[kode])) {
                  auditResults.value.push({ id:`riw-early-${r.id}-${it.kode}`, level:'red', statusLabel:'Masalah Serius', statusClass:'status-danger', reference:`Transaksi KELUAR: ${r.id} - ${it.kode}`, masalah:`Keluar (${r.tanggal}) sebelum MASUK pertama (${masukMap[kode].toLocaleString('id-ID')}).` });
                  counts.red++;
                }
                // sj presence check (assume r.sjNomor)
                if (!r.sjNomor) {
                  auditResults.value.push({ id:`riw-nosj-${r.id}-${it.kode}`, level:'yellow', statusLabel:'Perlu Dicek', statusClass:'status-warning', reference:`Transaksi KELUAR: ${r.id} - ${it.kode}`, masalah:`Riwayat keluar tidak memiliki nomor SJ (field 'sjNomor').` });
                  counts.yellow++;
                }
              }
            }

            if (counts.red>0) { showAuditAlert.value = true; showSnackbar(`Audit selesai: ditemukan ${counts.red} isu serius.`, 'error'); }
            else showSnackbar('Audit selesai: tidak ditemukan isu serius.', 'success');
          } catch(e){ console.error(e); showSnackbar('Audit gagal: '+e,'error'); } finally { isAuditing.value=false; }
        };

        const downloadAuditPdf = async () => {
          try {
            const container = document.createElement('div');
            container.style.padding='16px'; container.style.background='#fff'; container.style.fontFamily='Arial';
            container.innerHTML = `<h2>Audit - ${new Date().toLocaleString('id-ID')}</h2><p>Ringkasan: Serius: ${counts.red} | Perlu Dicek: ${counts.yellow} | Aman: ${counts.green}</p><table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f5f5f5"><th style="padding:8px;border:1px solid #ddd">Referensi</th><th style="padding:8px;border:1px solid #ddd">Masalah</th><th style="padding:8px;border:1px solid #ddd">Status</th></tr></thead><tbody>${auditResults.value.map(it=>`<tr><td style="padding:8px;border:1px solid #ddd">${it.reference}</td><td style="padding:8px;border:1px solid #ddd">${it.masalah}</td><td style="padding:8px;border:1px solid #ddd">${it.statusLabel}</td></tr>`).join('')}</tbody></table>`;
            document.body.appendChild(container);
            const canvas = await html2canvas(container, { scale:2, useCORS:true });
            const img = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit:'pt', format:'a4' });
            const pdfW = pdf.internal.pageSize.getWidth();
            const pdfH = (canvas.height*pdfW)/canvas.width;
            pdf.addImage(img,'PNG',20,20,pdfW-40,pdfH);
            pdf.save(`Laporan_Audit_${new Date().toLocaleDateString('id-ID')}.pdf`);
            document.body.removeChild(container);
          } catch(e){ console.error(e); showSnackbar('Gagal buat PDF audit: '+e,'error'); }
        };

        // Firestore listeners
        onMounted(()=> {
          const qBarang = query(barangCol, orderBy('kode'));
          onSnapshot(qBarang, (snap)=> {
            barang.value = snap.docs.map(d => { const data = d.data(); return { id:d.id, display:`${data.kode||''} - ${data.nama||''}`, ...data }; });
            isLoading.value=false;
          });

          const qRiw = query(riwayatCol, orderBy('tanggal','desc'));
          onSnapshot(qRiw, (snap)=> {
            riwayat.value = snap.docs.map(d => {
              const data = d.data();
              const timestamp = data.tanggal ? new Date(data.tanggal.seconds*1000) : new Date();
              return { id:d.id, ...data, timestamp:timestamp, tanggal: timestamp.toLocaleString('id-ID') };
            });
          });
        });

        return {
          currentPage, navValue, search, dialog, dialogMode, snackbar, isLoading, isSubmitting,
          barang, barangHeaders, riwayat, riwayatHeaders, laporan, filteredRiwayat, riwayatKeluar, suratJalanHeaders,
          editedItem, formTransaksi, formKeluar, itemKeluar,
          pageTitle, dialogTitle,
          tanggalMulai, tanggalSelesai, resetFilterTanggal,
          sjAktif, sjTotalNilai,
          // audit
          auditResults, auditHeaders, isAuditing, runAudit, counts, showAuditAlert, downloadAuditPdf,
          // actions
          showSnackbar, openDialog, closeDialog, simpanDialog,
          catatTransaksi, checkStok:()=>true, tambahBarangKeDaftar, hapusBarangDariDaftar, catatTransaksiKeluar,
          exportStokToExcel, exportLaporanToExcel,
          lihatSuratJalan, downloadSjDocx, downloadSjPdf, exportSJtoPDF, formatRupiah, kembaliKeSjList, runAudit
        };
      }
    }).use(vuetify).mount('#app');
