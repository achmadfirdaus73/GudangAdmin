import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
    import { getFirestore, collection, onSnapshot, addDoc, doc, updateDoc, deleteDoc, runTransaction, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

    const { createApp, ref, computed, onMounted, reactive } = Vue;
    const { createVuetify } = Vuetify;
    const vuetify = createVuetify();

    createApp({
      setup() {
        // Firebase config
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
        const snackbar = reactive({ show: false, text: '', color: 'success' });
        const isLoading = ref(true);
        const isSubmitting = ref(false);
        const tanggalMulai = ref(null);
        const tanggalSelesai = ref(null);

        // sj/view
        const sjAktif = ref({ id: '', tanggal: '', tujuan: '', items: [] });

        const barang = ref([]);
        const riwayat = ref([]);

        const defaultItem = { kode: '', nama: '', stok: 0, harga_satuan: 0 };
        const editedItem = ref({ ...defaultItem });
        const formTransaksi = ref({ id: null, jumlah: null });
        const formKeluar = ref({ tujuan: '', items: [] });
        const itemKeluar = ref({ barang: null, jumlah: null });

        // headers (vuetify 3 expects 'title'|'value' or 'text'|'value' depending on component; using value/title where used)
        const barangHeaders = [
          { title: 'Kode', value: 'kode' },
          { title: 'Nama Barang', value: 'nama' },
          { title: 'Harga Satuan', value: 'harga_satuan', align: 'end' },
          { title: 'Stok', value: 'stok', align: 'end' },
          { title: 'Total Nilai', value: 'total_nilai', align: 'end' },
          { title: 'Aksi', value: 'actions', sortable: false, align: 'end' }
        ];

        const riwayatHeaders = [
          { title: 'Tanggal', value: 'tanggal' },
          { title: 'Tujuan/Ket', value: 'tujuan' },
          { title: 'Jml Item', value: 'totalItems' },
          { title: 'Total Kuantitas', value: 'totalJumlah', align: 'end' }
        ];

        const suratJalanHeaders = [
          { title: 'Tanggal', value: 'tanggal' },
          { title: 'Tujuan', value: 'tujuan' },
          { title: 'Items', value: 'items' },
          { title: 'Aksi', value: 'actions', sortable: false }
        ];

        const pageTitle = computed(() => {
          const titles = { stok: 'Stok Barang', masuk: 'Form Barang Masuk', keluar: 'Form Barang Keluar', laporan: 'Laporan Transaksi', suratJalan: 'Surat Jalan', viewSJ: 'Detail Surat Jalan' };
          return titles[currentPage.value] || 'Aplikasi Gudang';
        });

        const dialogTitle = computed(() => {
          const titles = { tambah: 'Barang Baru', edit: 'Edit Barang', hapus: 'Konfirmasi Hapus' };
          return titles[dialogMode.value] || '';
        });

        const formatRupiah = (angka) => {
          if (angka === null || angka === undefined) return 'Rp 0';
          return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
        };

        const showSnackbar = (text, color = 'success') => { snackbar.text = text; snackbar.color = color; snackbar.show = true; };

        const openDialog = (mode, item = null) => { dialogMode.value = mode; editedItem.value = item ? { ...item } : { ...defaultItem }; dialog.value = true; };
        const closeDialog = () => { dialog.value = false; };

        // computed
        const filteredRiwayat = computed(() => {
          let data = riwayat.value.slice();
          if (tanggalMulai.value) {
            const start = new Date(tanggalMulai.value); start.setHours(0,0,0,0);
            data = data.filter(item => item.timestamp >= start);
          }
          if (tanggalSelesai.value) {
            const end = new Date(tanggalSelesai.value); end.setHours(23,59,59,999);
            data = data.filter(item => item.timestamp <= end);
          }
          return data;
        });

        const riwayatKeluar = computed(() => riwayat.value.filter(r => r.tipe === 'KELUAR'));

        const laporan = computed(() => {
          const data = filteredRiwayat.value;
          const totalMasuk = data.filter(r => r.tipe === 'MASUK').reduce((sum, item) => sum + (item.totalJumlah || 0), 0);
          const totalKeluar = data.filter(r => r.tipe === 'KELUAR').reduce((sum, item) => sum + (item.totalJumlah || 0), 0);
          const totalNilaiAset = barang.value.reduce((sum, item) => sum + ((item.stok || 0) * (item.harga_satuan || 0)), 0);
          return { totalMasuk, totalKeluar, totalNilaiAset };
        });

        const sjTotalNilai = computed(() => {
          if (!sjAktif.value || !sjAktif.value.items) return 0;
          return sjAktif.value.items.reduce((sum, item) => sum + ((item.jumlah || 0) * (item.harga_satuan || 0)), 0);
        });

        // CRUD barang
        const simpanDialog = async () => {
          isSubmitting.value = true;
          try {
            if (dialogMode.value === 'tambah') {
              if (!editedItem.value.kode || !editedItem.value.nama) { showSnackbar('Kode dan Nama tidak boleh kosong!', 'error'); isSubmitting.value = false; return; }
              const payload = { kode: editedItem.value.kode, nama: editedItem.value.nama, stok: Number(editedItem.value.stok||0), harga_satuan: Number(editedItem.value.harga_satuan||0) };
              await addDoc(barangCol, payload);
              showSnackbar('Barang baru berhasil ditambahkan!');
            } else if (dialogMode.value === 'edit') {
              const { id, ...dataToUpdate } = editedItem.value;
              if (!id) { showSnackbar('ID barang tidak ditemukan', 'error'); isSubmitting.value = false; return; }
              const docRef = doc(db, 'barang', id);
              await updateDoc(docRef, { kode: dataToUpdate.kode, nama: dataToUpdate.nama, harga_satuan: Number(dataToUpdate.harga_satuan||0) });
              showSnackbar('Data barang berhasil diupdate!');
            } else if (dialogMode.value === 'hapus') {
              if (!editedItem.value.id) { showSnackbar('ID barang tidak ditemukan', 'error'); isSubmitting.value = false; return; }
              await deleteDoc(doc(db, 'barang', editedItem.value.id));
              showSnackbar('Barang berhasil dihapus!', 'warning');
            }
            closeDialog();
          } catch (e) {
            showSnackbar('Terjadi error!', 'error'); console.error(e);
          } finally { isSubmitting.value = false; }
        };

        // transaksi masuk
        const catatTransaksi = async (tipe) => {
          if (tipe === 'KELUAR') { await catatTransaksiKeluar(); return; }
          if (!formTransaksi.value.id || !(Number(formTransaksi.value.jumlah) > 0)) { showSnackbar('Gagal! Periksa input.', 'error'); return; }
          isSubmitting.value = true;
          const barangRef = doc(db, 'barang', formTransaksi.value.id);
          try {
            await runTransaction(db, async (transaction) => {
              const barangDoc = await transaction.get(barangRef);
              if (!barangDoc.exists()) { throw "Barang tidak ditemukan!"; }
              const dataBarang = barangDoc.data();
              const stokBaru = (dataBarang.stok || 0) + Number(formTransaksi.value.jumlah || 0);
              transaction.update(barangRef, { stok: stokBaru });
              const itemData = { id: formTransaksi.value.id, kode: dataBarang.kode, nama: dataBarang.nama, jumlah: Number(formTransaksi.value.jumlah || 0), harga_satuan: dataBarang.harga_satuan || 0 };
              const riwayatBaru = { tipe: 'MASUK', tujuan: 'Stok Masuk', items: [itemData], totalJumlah: Number(formTransaksi.value.jumlah || 0), totalItems: 1, tanggal: serverTimestamp() };
              const newRiwayatRef = doc(riwayatCol);
              transaction.set(newRiwayatRef, riwayatBaru);
            });
            showSnackbar(`Transaksi masuk berhasil!`);
            formTransaksi.value = { id: null, jumlah: null };
          } catch (e) { showSnackbar(`Error: ${e}`, 'error'); console.error(e); } finally { isSubmitting.value = false; }
        };

        // tambah barang keluar ke daftar
        const tambahBarangKeDaftar = () => {
          if (!itemKeluar.value.barang || !itemKeluar.value.jumlah || itemKeluar.value.jumlah <= 0) { showSnackbar('Pilih barang dan isi jumlah dengan benar', 'error'); return; }
          if ((itemKeluar.value.barang.stok || 0) < itemKeluar.value.jumlah) { showSnackbar('Stok tidak mencukupi!', 'error'); return; }
          formKeluar.value.items.push({ ...itemKeluar.value.barang, jumlah: Number(itemKeluar.value.jumlah) });
          itemKeluar.value = { barang: null, jumlah: null };
        };

        const hapusBarangDariDaftar = (index) => { formKeluar.value.items.splice(index, 1); };

        // transaksi keluar multi-item
        const catatTransaksiKeluar = async () => {
          if (!formKeluar.value.tujuan || formKeluar.value.items.length === 0) { showSnackbar('Tujuan dan daftar barang tidak boleh kosong', 'error'); return; }
          isSubmitting.value = true;
          try {
            await runTransaction(db, async (transaction) => {
              const refs = formKeluar.value.items.map(item => doc(db, 'barang', item.id));
              const docs = await Promise.all(refs.map(ref => transaction.get(ref)));

              for (let i = 0; i < docs.length; i++) {
                const barangDoc = docs[i]; const item = formKeluar.value.items[i];
                if (!barangDoc.exists()) throw `Barang ${item.nama || ''} tidak ditemukan!`;
                const stokSaatIni = barangDoc.data().stok || 0;
                if (stokSaatIni < item.jumlah) throw `Stok ${item.nama || ''} tidak mencukupi!`;
              }

              for (let i = 0; i < docs.length; i++) {
                const barangRef = refs[i]; const item = formKeluar.value.items[i]; const stokSaatIni = docs[i].data().stok || 0; const stokBaru = stokSaatIni - item.jumlah;
                transaction.update(barangRef, { stok: stokBaru });
              }

              const riwayatBaru = { tipe: 'KELUAR', tujuan: formKeluar.value.tujuan, items: formKeluar.value.items.map(i => ({ id: i.id, kode: i.kode, nama: i.nama, jumlah: i.jumlah, harga_satuan: i.harga_satuan || 0 })), totalJumlah: formKeluar.value.items.reduce((sum, i) => sum + (i.jumlah || 0), 0), totalItems: formKeluar.value.items.length, tanggal: serverTimestamp() };
              const newRiwayatRef = doc(riwayatCol);
              transaction.set(newRiwayatRef, riwayatBaru);
            });
            showSnackbar('Transaksi keluar berhasil dicatat!'); formKeluar.value = { tujuan: '', items: [] }; currentPage.value = 'suratJalan'; navValue.value = 'suratJalan';
          } catch (e) { showSnackbar(`Error: ${e}`, 'error'); console.error(e); } finally { isSubmitting.value = false; }
        };

        const checkStok = (jumlahKeluar) => {
          if (!formTransaksi.value.id) return true; const item = barang.value.find(b => b.id === formTransaksi.value.id); return (item && (item.stok || 0) >= Number(jumlahKeluar)) || 'Jumlah melebihi stok!';
        };

        // Export stok & laporan (XLSX)
        const exportStokToExcel = () => {
          const dataArray = barang.value; if (!dataArray || dataArray.length === 0) { showSnackbar('Tidak ada data stok untuk diexport', 'warning'); return; }
          const dataToExport = dataArray.map(item => ({ 'Kode Barang': item.kode, 'Nama Barang': item.nama, 'Harga Satuan': item.harga_satuan || 0, 'Stok': item.stok || 0, 'Total Nilai': (item.stok || 0) * (item.harga_satuan || 0) }));
          const worksheet = XLSX.utils.json_to_sheet(dataToExport);
          XLSX.utils.sheet_add_aoa(worksheet, [["", "", "", "Grand Total:", laporan.value.totalNilaiAset]], { origin: -1 });
          const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Daftar Stok"); XLSX.writeFile(workbook, `Daftar_Stok_Barang_${new Date().toLocaleDateString('id-ID')}.xlsx`);
        };

        const exportLaporanToExcel = () => {
          const dataArray = filteredRiwayat.value; if (!dataArray || dataArray.length === 0) { showSnackbar('Tidak ada data laporan untuk diexport', 'warning'); return; }
          const summaryData = [ { 'Laporan Transaksi Gudang': `Periode: ${tanggalMulai.value || 'Semua'} - ${tanggalSelesai.value || 'Semua'}` }, { '': '' }, { 'Deskripsi': 'Total Barang Datang', 'Jumlah': laporan.value.totalMasuk }, { 'Deskripsi': 'Total Barang Keluar', 'Jumlah': laporan.value.totalKeluar } ];
          const detailData = dataArray.flatMap(item => (item.items || []).map(detail => ({ 'Tanggal': item.tanggal, 'Tipe': item.tipe, 'Tujuan/Ket': item.tujuan || '-', 'Kode Barang': detail.kode, 'Nama Barang': detail.nama, 'Jumlah': detail.jumlah })));
          const worksheet = XLSX.utils.json_to_sheet(summaryData, { skipHeader: true }); XLSX.utils.sheet_add_aoa(worksheet, [[' ']], { origin: -1 }); XLSX.utils.sheet_add_aoa(worksheet, [['Tanggal', 'Tipe', 'Tujuan/Ket', 'Kode Barang', 'Nama Barang', 'Jumlah']], { origin: -1 }); XLSX.utils.sheet_add_json(worksheet, detailData, { origin: -1, skipHeader: true }); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Laporan"); XLSX.writeFile(workbook, `Laporan_Transaksi_Gudang_${new Date().toLocaleDateString('id-ID')}.xlsx`);
        };

        const resetFilterTanggal = () => { tanggalMulai.value = null; tanggalSelesai.value = null; };

        // lihat SJ dari list
        const lihatSuratJalan = (item) => { sjAktif.value = item; currentPage.value = 'viewSJ'; };
        const kembaliKeSjList = () => { currentPage.value = 'suratJalan'; navValue.value = 'suratJalan'; };

        // DOCX download (existing)
        const downloadSjDocx = () => {
          const contentNode = document.getElementById('surat-jalan-content');
          if (!contentNode) { showSnackbar('Gagal membuat dokumen, konten tidak ditemukan.', 'error'); return; }
          const content = contentNode.innerHTML;
          const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body { font-family: Arial, sans-serif; font-size: 11pt; } table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #999; text-align: left; padding: 8px; } th { background-color: #f2f2f2; } .text-center { text-align: center; } .text-right { text-align: right; } .font-weight-bold { font-weight: bold; } .my-4 { margin-top: 16px; margin-bottom: 16px; } .mt-6 { margin-top: 24px; } .mt-15 { margin-top: 40px; }</style></head><body>${content}</body></html>`;
          try { const converted = htmlDocx.asBlob(fullHtml); const filename = `SJ-${sjAktif.value.id ? sjAktif.value.id.slice(-6).toUpperCase() : Date.now()}.docx`; saveAs(converted, filename); } catch(e) { console.error(e); showSnackbar('Gagal membuat file dokumen.', 'error'); }
        };

        // PDF export using html2canvas + jsPDF
        const downloadSjPdf = async () => {
          try {
            const el = document.getElementById('surat-jalan-content'); if (!el) { showSnackbar('Konten tidak ditemukan untuk PDF', 'error'); return; }
            // small delay to ensure rendering
            await new Promise(r => setTimeout(r, 200));
            const canvas = await html2canvas(el, { scale: 2, useCORS: true, allowTaint: true });
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 20, 20, pdfWidth - 40, pdfHeight);
            // handle multi-page by slicing
            let remaining = pdfHeight; const pageHeight = pdf.internal.pageSize.getHeight() - 40; let position = 20;
            while (remaining > pageHeight) { remaining -= pageHeight; position = position - pageHeight; pdf.addPage(); pdf.addImage(imgData, 'PNG', 20, position, pdfWidth - 40, pdfHeight); }
            pdf.save(`${sjAktif.value.nomor || 'SURAT_JALAN'}.pdf`);
          } catch (e) { console.error(e); showSnackbar('Gagal membuat PDF: ' + e, 'error'); }
        };

        // Export single SJ directly to PDF from list (preview then download)
        const exportSJtoPDF = async (sj) => { sjAktif.value = sj; currentPage.value = 'viewSJ'; await new Promise(r => setTimeout(r, 300)); await downloadSjPdf(); };

        // Firestore listeners
        onMounted(() => {
          const qBarang = query(barangCol, orderBy('kode'));
          onSnapshot(qBarang, (snapshot) => {
            barang.value = snapshot.docs.map(d => { const data = d.data(); return { id: d.id, display: `${data.kode || ''} - ${data.nama || ''}`, ...data }; });
            isLoading.value = false;
          });

          const qRiwayat = query(riwayatCol, orderBy('tanggal', 'desc'));
          onSnapshot(qRiwayat, (snapshot) => {
            riwayat.value = snapshot.docs.map(d => { const data = d.data(); const timestamp = data.tanggal ? new Date(data.tanggal.seconds * 1000) : new Date(); return { id: d.id, ...data, timestamp: timestamp, tanggal: timestamp.toLocaleString('id-ID') }; });
          });
        });

        return {
          // state
          currentPage, navValue, search, dialog, dialogMode, snackbar, isLoading, isSubmitting,
          barang, barangHeaders, riwayat, riwayatHeaders, laporan, filteredRiwayat, riwayatKeluar, suratJalanHeaders,
          editedItem, formTransaksi, formKeluar, itemKeluar,
          pageTitle, dialogTitle,
          tanggalMulai, tanggalSelesai, resetFilterTanggal,
          sjAktif, sjTotalNilai,
          // actions
          showSnackbar, openDialog, closeDialog, simpanDialog,
          catatTransaksi, checkStok, tambahBarangKeDaftar, hapusBarangDariDaftar, catatTransaksiKeluar,
          exportStokToExcel, exportLaporanToExcel,
          lihatSuratJalan, downloadSjDocx, downloadSjPdf, exportSJtoPDF, formatRupiah, kembaliKeSjList
        };
      }
    }).use(vuetify).mount('#app');