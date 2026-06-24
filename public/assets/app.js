        const firebaseConfig = {
            apiKey: "AIzaSyDS1S1ZVnt6AHttYgZvoT7LEGYI9CrHaqI",
            authDomain: "business-vehicle-usage-log.firebaseapp.com",
            databaseURL: "https://business-vehicle-usage-log-default-rtdb.asia-southeast1.firebasedatabase.app",
            projectId: "business-vehicle-usage-log",
            storageBucket: "business-vehicle-usage-log.firebasestorage.app",
            messagingSenderId: "15966219213",
            appId: "1:15966219213:web:6396eaa916c671ec39b284"
        };

        firebase.initializeApp(firebaseConfig);

        const db = firebase.database().ref("carLogs");
        const receiptStorage = firebase.storage().ref("receipts");
        const form = document.getElementById("logForm");
        const receiptDataInput = document.getElementById("receiptData");
        const receiptNameInput = document.getElementById("receiptName");
        const receiptFileInput = document.getElementById("receiptFile");
        const receiptCameraBtn = document.getElementById("receiptCameraBtn");
        const receiptFileName = document.getElementById("receiptFileName");
        const cameraModal = document.getElementById("cameraModal");
        const cameraPreview = document.getElementById("cameraPreview");
        const cameraSnapshot = document.getElementById("cameraSnapshot");
        const cameraCanvas = document.getElementById("cameraCanvas");
        const cameraCaptureBtn = document.getElementById("cameraCaptureBtn");
        const cameraUseBtn = document.getElementById("cameraUseBtn");
        const cameraRetakeBtn = document.getElementById("cameraRetakeBtn");
        const cameraCloseBtn = document.getElementById("cameraCloseBtn");
        const mobilePreviewEmpty = document.getElementById("mobilePreviewEmpty");
        const mobilePreviewGrid = document.getElementById("mobilePreviewGrid");
        const mobilePreviewEditBtn = document.getElementById("mobilePreviewEditBtn");
        const formFieldIds = ["driveDate", "userName", "userDept", "startLoc", "endLoc", "purpose", "cardType", "cardUsage", "startKm", "endKm", "expense", "isRoundTrip"];
        let logsData = {};
        let clickCount = 0;
        let clickTimer = null;
        let lastPreviewRecord = null;
        let cameraStream = null;
        let capturedReceiptData = "";
        let capturedReceiptExtension = "jpg";
        let pendingReceiptFile = null;
        let pendingReceiptDataUrl = "";

        function escapeHtml(value) {
            return String(value ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#39;");
        }

        function xmlEscape(value) {
            return String(value ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&apos;");
        }

        function toNumber(value) {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }

        function formatNumber(value) {
            return toNumber(value).toLocaleString("ko-KR");
        }

        function todayText() {
            return new Date().toISOString().slice(0, 10);
        }

        function sortRecords(items) {
            return [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        function sanitizeFilePart(value) {
            return String(value || "")
                .trim()
                .replace(/[\/:*?"<>|]/g, "-")
                .replace(/\s+/g, " ")
                .slice(0, 80) || "미입력";
        }

        function getGeneratedReceiptName(extension = "jpg") {
            const date = sanitizeFilePart(document.getElementById("driveDate").value || todayText());
            const user = sanitizeFilePart(document.getElementById("userName").value || "미입력");
            const start = sanitizeFilePart(document.getElementById("startLoc").value || "미입력");
            const end = sanitizeFilePart(document.getElementById("endLoc").value || "미입력");
            return `${date}_${user}_${start} ${end}.${extension}`;
        }

        function sanitizeStorageFileName(name) {
            return String(name || "receipt.jpg").replace(/[\\/:*?"<>|#%]/g, "_");
        }

        function dataUrlToBlob(dataUrl) {
            const [header, base64] = dataUrl.split(",");
            const mimeMatch = header.match(/data:(.*?);base64/);
            const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);

            for (let index = 0; index < binary.length; index += 1) {
                bytes[index] = binary.charCodeAt(index);
            }

            return new Blob([bytes], { type: mimeType });
        }

        async function uploadPendingReceipt(recordKey) {
            if (!pendingReceiptFile && !pendingReceiptDataUrl) return null;

            const receiptName = receiptNameInput.value || getGeneratedReceiptName(capturedReceiptExtension);
            const safeName = sanitizeStorageFileName(receiptName);
            const objectRef = receiptStorage.child(`${recordKey}/${Date.now()}-${safeName}`);
            const payload = pendingReceiptFile || dataUrlToBlob(pendingReceiptDataUrl);
            const snapshot = await objectRef.put(payload);
            const downloadUrl = await snapshot.ref.getDownloadURL();

            return {
                receipt: downloadUrl,
                receiptName,
                receiptPath: snapshot.ref.fullPath
            };
        }

        async function deleteStoredReceipt(record) {
            if (!record || !record.receiptPath) return;

            try {
                await firebase.storage().ref(record.receiptPath).delete();
            } catch (error) {
                console.warn("Stored receipt delete skipped.", error);
            }
        }

        function getFileExtension(fileName) {
            const parts = String(fileName || "").split(".");
            return parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
        }

        function getCurrentDraftRecord() {
            const record = {
                date: document.getElementById("driveDate").value,
                carNum: document.getElementById("carNumInput").value.trim(),
                user: document.getElementById("userName").value.trim(),
                dept: document.getElementById("userDept").value,
                start: document.getElementById("startLoc").value.trim(),
                end: document.getElementById("endLoc").value.trim(),
                round: document.getElementById("isRoundTrip").checked,
                purpose: document.getElementById("purpose").value.trim(),
                cardType: document.getElementById("cardType").value,
                cardUsage: document.getElementById("cardUsage").value,
                startKm: toNumber(document.getElementById("startKm").value),
                endKm: toNumber(document.getElementById("endKm").value),
                expense: toNumber(document.getElementById("expense").value),
                receipt: receiptDataInput.value || pendingReceiptDataUrl || (pendingReceiptFile ? "pending" : ""),
                receiptName: receiptNameInput.value
            };

            const hasMeaningfulData = [record.date, record.user, record.start, record.end, record.purpose, record.carNum, record.dept]
                .some((value) => String(value || "").trim() !== "")
                || record.startKm > 0
                || record.endKm > 0
                || record.expense > 0
                || record.receipt;

            return hasMeaningfulData ? record : null;
        }

        function getMobilePreviewRecord(sortedRecords) {
            return lastPreviewRecord;
        }

        function renderMobilePreview(previewRecord) {
            if (!previewRecord) {
                mobilePreviewEmpty.style.display = "block";
                mobilePreviewGrid.innerHTML = "";
                mobilePreviewEditBtn.classList.add("hidden");
                return;
            }

            mobilePreviewEmpty.style.display = "none";
            if (previewRecord.key) {
                mobilePreviewEditBtn.classList.remove("hidden");
                mobilePreviewEditBtn.dataset.key = previewRecord.key;
            } else {
                mobilePreviewEditBtn.classList.add("hidden");
                mobilePreviewEditBtn.dataset.key = "";
            }
            const distance = Math.max(toNumber(previewRecord.endKm) - toNumber(previewRecord.startKm), 0);
            const items = [
                ["일자", previewRecord.date || "-"],
                ["사용자", previewRecord.user || "-"],
                ["부서", previewRecord.dept || "-"],
                ["출발지", previewRecord.start || "-", true],
                ["도착지", previewRecord.end || "-", true],
                ["왕복", previewRecord.round ? "Y" : "-"],
                ["전(km)", formatNumber(previewRecord.startKm)],
                ["후(km)", formatNumber(previewRecord.endKm)],
                ["거리", formatNumber(distance)],
                ["목적", previewRecord.purpose || "-", true],
                ["카드 구분", previewRecord.cardType || "-"],
                ["카드 사용 내역", previewRecord.cardUsage || "-", true],
                ["카드 사용금액", formatNumber(previewRecord.expense)],
                ["영수증", previewRecord.receiptName || (previewRecord.receipt ? "등록된 영수증 이미지" : "없음"), true]
            ];

            mobilePreviewGrid.innerHTML = items.map(([label, value, full]) => `
                <div class="mobile-preview-item${full ? " full" : ""}">
                    <div class="mobile-preview-label">${escapeHtml(label)}</div>
                    <div class="mobile-preview-value">${escapeHtml(value)}</div>
                </div>
            `).join("");
        }

        function renderDesktopTable(sortedRecords) {
            const tbody = document.getElementById("logList");
            tbody.innerHTML = "";

            let lastKm = 0;
            sortedRecords.forEach((item) => {
                const diff = Math.max(toNumber(item.endKm) - toNumber(item.startKm), 0);
                lastKm = toNumber(item.endKm);
                const safeReceiptName = escapeHtml(item.receiptName || `영수증_${item.date}_${item.user}.png`);
                tbody.innerHTML += `
                    <tr>
                        <td>${escapeHtml(item.date)}</td>
                        <td class="font-bold">${escapeHtml(item.user)}</td>
                        <td>${escapeHtml(item.dept)}</td>
                        <td>${escapeHtml(item.start)}</td>
                        <td>${escapeHtml(item.end)}</td>
                        <td>${item.round ? "Y" : "-"}</td>
                        <td>${formatNumber(item.startKm)}</td>
                        <td>${formatNumber(item.endKm)}</td>
                        <td class="bg-dist">${formatNumber(diff)}</td>
                        <td>${escapeHtml(item.purpose)}</td>
                        <td>${escapeHtml(item.cardType || "-")}</td>
                        <td>${escapeHtml(item.cardUsage || "-")}</td>
                        <td class="text-red-600 font-bold">${formatNumber(item.expense)}</td>
                        <td class="print-hide">${item.receipt ? `<button onclick="openModal('${item.receipt}', '${safeReceiptName}')" class="text-blue-600 font-bold underline">확인</button>` : "-"}</td>
                        <td class="no-print">
                            <button onclick="editLog('${item.key}')" class="text-blue-500 mr-2">수정</button>
                            <button onclick="deleteLog('${item.key}')" class="text-red-300">삭제</button>
                        </td>
                    </tr>`;
            });

            if (lastKm > 0 && !document.getElementById("editKey").value) {
                document.getElementById("startKm").value = lastKm;
            }
        }

        function render() {
            const sortedRecords = sortRecords(Object.keys(logsData).map((key) => ({ ...logsData[key], key })));
            renderDesktopTable(sortedRecords);
            renderMobilePreview(getMobilePreviewRecord(sortedRecords));
        }

        function handleAdmin() {
            clickCount += 1;
            if (clickTimer) clearTimeout(clickTimer);
            if (clickCount === 3) {
                document.getElementById("resetBtn").classList.toggle("hidden-admin");
                clickCount = 0;
                clickTimer = null;
                return;
            }
            clickTimer = setTimeout(() => {
                clickCount = 0;
                clickTimer = null;
            }, 2000);
        }

        db.on("value", (snap) => {
            logsData = snap.val() || {};
            render();
        });

        function editCurrentPreview() {
            const key = mobilePreviewEditBtn.dataset.key;
            if (key) editLog(key);
        }
        function editLog(key) {
            const item = logsData[key];
            document.getElementById("editKey").value = key;
            document.getElementById("driveDate").value = item.date;
            document.getElementById("carNumInput").value = item.carNum || "240하 2150";
            document.getElementById("userName").value = item.user;
            document.getElementById("userDept").value = item.dept;
            document.getElementById("startLoc").value = item.start;
            document.getElementById("endLoc").value = item.end;
            document.getElementById("isRoundTrip").checked = !!item.round;
            document.getElementById("purpose").value = item.purpose;
            document.getElementById("cardType").value = item.cardType || "";
            document.getElementById("cardUsage").value = item.cardUsage || "";
            document.getElementById("startKm").value = item.startKm;
            document.getElementById("endKm").value = item.endKm;
            document.getElementById("expense").value = item.expense;
            receiptDataInput.value = item.receipt || "";
            receiptNameInput.value = item.receiptName || "";
            receiptFileName.textContent = item.receiptName || (item.receipt ? "등록된 영수증 이미지" : "선택된 파일 없음");
            pendingReceiptFile = null;
            pendingReceiptDataUrl = "";
            document.getElementById("submitBtn").innerText = "내용 수정";
            lastPreviewRecord = { ...item, key };
            render();
            window.scrollTo({ top: 0, behavior: "smooth" });
        }

        async function deleteLog(key) {
            if (prompt("삭제 비밀번호를 입력하세요.") === "7890") {
                await deleteStoredReceipt(logsData[key]);
                db.child(key).remove();
            }
        }

        async function deleteAllStoredReceipts() {
            const records = Object.values(logsData);
            await Promise.all(records.map((record) => deleteStoredReceipt(record)));
        }

        async function resetAll() {
            if (confirm("전체 데이터를 초기화하시겠습니까?") && prompt("마스터 비밀번호") === "aldaver147!") {
                await deleteAllStoredReceipts();
                db.remove();
                lastPreviewRecord = null;
            }
        }

        function exportExcel() {
            const records = sortRecords(Object.values(logsData));
            const header = ["일자", "사용자", "부서", "출발지", "도착지", "왕복", "목적", "전(km)", "후(km)", "거리", "카드 사용금액"];
            const rows = records.map((item) => {
                const distance = Math.max(toNumber(item.endKm) - toNumber(item.startKm), 0);
                return [
                    item.date || "",
                    item.user || "",
                    item.dept || "",
                    item.start || "",
                    item.end || "",
                    item.round ? "Y" : "-",
                    item.purpose || "",
                    toNumber(item.startKm),
                    toNumber(item.endKm),
                    distance,
                    toNumber(item.expense)
                ];
            });

            const numericIndexes = new Set([7, 8, 9, 10]);
            const htmlRows = [header, ...rows].map((row, rowIndex) => `
                <tr>
                    ${row.map((cell, colIndex) => {
                        if (rowIndex === 0) return `<th>${xmlEscape(cell)}</th>`;
                        if (numericIndexes.has(colIndex)) return `<td class="num">${toNumber(cell)}</td>`;
                        const className = colIndex === 0 ? "date" : "text";
                        return `<td class="${className}">${xmlEscape(cell)}</td>`;
                    }).join("")}
                </tr>
            `).join("");

            const excelHtml = `
                <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
                <head>
                    <meta charset="UTF-8">
                    <!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>운행기록</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
                    <style>
                        table { border-collapse: collapse; }
                        th, td { border: 1px solid #5b6573; padding: 6px 8px; font-size: 11pt; }
                        th { background: #1e3a8a; color: #ffffff; font-weight: 700; text-align: center; }
                        td.text { text-align: center; }
                        td.date { mso-number-format: "yyyy-mm-dd"; }
                        td.num { text-align: right; mso-number-format: "#,##0"; }
                    </style>
                </head>
                <body>
                    <table>${htmlRows}</table>
                </body>
                </html>`;

            const blob = new Blob(["﻿" + excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "법인차량운행일지.xls";
            link.click();
            URL.revokeObjectURL(url);
        }

        function openModal(base64, name) {
            document.getElementById("fullImg").src = base64;
            document.getElementById("modalDown").onclick = () => {
                const a = document.createElement("a");
                a.href = base64;
                a.download = name || "영수증.png";
                a.click();
            };
            document.getElementById("imgModal").classList.remove("hidden");
        }

        function closeModal() {
            document.getElementById("imgModal").classList.add("hidden");
            document.getElementById("fullImg").src = "";
            document.getElementById("modalDown").onclick = null;
        }

        function clearReceiptState() {
            receiptDataInput.value = "";
            receiptNameInput.value = "";
            receiptFileName.textContent = "선택된 파일 없음";
            receiptFileInput.value = "";
            capturedReceiptData = "";
            capturedReceiptExtension = "jpg";
            pendingReceiptFile = null;
            pendingReceiptDataUrl = "";
        }
        function handleReceiptSelection(file, mode) {
            if (!file) {
                receiptFileName.textContent = "선택된 파일 없음";
                receiptNameInput.value = "";
                pendingReceiptFile = null;
                pendingReceiptDataUrl = "";
                return;
            }

            const extension = getFileExtension(file.name || "jpg");
            const receiptName = mode === "camera" ? getGeneratedReceiptName(extension) : file.name;
            receiptNameInput.value = receiptName;
            receiptFileName.textContent = receiptName;
            receiptDataInput.value = "";
            pendingReceiptFile = file;
            pendingReceiptDataUrl = "";
            render();
        }


        async function openCameraModal() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                alert("이 기기나 브라우저에서는 직접 카메라 촬영이 지원되지 않습니다. 파일 선택을 이용해 주세요.");
                return;
            }

            capturedReceiptData = "";
            cameraUseBtn.disabled = true;
            cameraRetakeBtn.classList.add("hidden");
            cameraSnapshot.classList.add("hidden");
            cameraPreview.classList.remove("hidden");
            cameraModal.classList.remove("hidden");

            try {
                cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: "environment" },
                        width: { ideal: 1280 },
                        height: { ideal: 960 }
                    },
                    audio: false
                });
                cameraPreview.srcObject = cameraStream;
                await cameraPreview.play();
            } catch (error) {
                closeCameraCaptureModal();
                alert("카메라 접근에 실패했습니다. 권한을 허용한 뒤 다시 시도해 주세요.");
            }
        }

        function stopCameraStream() {
            if (cameraStream) {
                cameraStream.getTracks().forEach((track) => track.stop());
                cameraStream = null;
            }
            cameraPreview.srcObject = null;
        }

        function captureCameraPhoto() {
            const width = cameraPreview.videoWidth || 960;
            const height = cameraPreview.videoHeight || 1280;
            cameraCanvas.width = width;
            cameraCanvas.height = height;
            const context = cameraCanvas.getContext("2d");
            context.drawImage(cameraPreview, 0, 0, width, height);
            capturedReceiptData = cameraCanvas.toDataURL("image/jpeg", 0.92);
            capturedReceiptExtension = "jpg";
            cameraSnapshot.src = capturedReceiptData;
            cameraSnapshot.classList.remove("hidden");
            cameraPreview.classList.add("hidden");
            cameraUseBtn.disabled = false;
            cameraRetakeBtn.classList.remove("hidden");
            stopCameraStream();
        }

        async function retakeCameraPhoto() {
            closeCameraCaptureModal(false);
            await openCameraModal();
        }

        function useCapturedPhoto() {
            if (!capturedReceiptData) return;
            receiptDataInput.value = "";
            pendingReceiptFile = null;
            pendingReceiptDataUrl = capturedReceiptData;
            receiptNameInput.value = getGeneratedReceiptName(capturedReceiptExtension);
            receiptFileName.textContent = receiptNameInput.value;
            closeCameraCaptureModal();
            render();
        }

        function closeCameraCaptureModal(resetCapture = true) {
            stopCameraStream();
            cameraModal.classList.add("hidden");
            cameraSnapshot.classList.add("hidden");
            cameraPreview.classList.remove("hidden");
            cameraSnapshot.src = "";
            cameraUseBtn.disabled = true;
            cameraRetakeBtn.classList.add("hidden");
            if (resetCapture) {
                capturedReceiptData = "";
                capturedReceiptExtension = "jpg";
            }
        }

        function buildEntry() {
            const key = document.getElementById("editKey").value;
            const existingRecord = key ? logsData[key] : {};

            return {
                date: document.getElementById("driveDate").value,
                carNum: document.getElementById("carNumInput").value.trim(),
                user: document.getElementById("userName").value.trim(),
                dept: document.getElementById("userDept").value,
                start: document.getElementById("startLoc").value.trim(),
                end: document.getElementById("endLoc").value.trim(),
                round: document.getElementById("isRoundTrip").checked,
                purpose: document.getElementById("purpose").value.trim(),
                cardType: document.getElementById("cardType").value,
                cardUsage: document.getElementById("cardUsage").value,
                startKm: toNumber(document.getElementById("startKm").value),
                endKm: toNumber(document.getElementById("endKm").value),
                expense: toNumber(document.getElementById("expense").value),
                receipt: receiptDataInput.value || existingRecord?.receipt || "",
                receiptName: receiptNameInput.value || existingRecord?.receiptName || "",
                receiptPath: existingRecord?.receiptPath || ""
            };
        }

        function validateRequiredFields(entry = null) {
            const requiredFields = [
                { id: "userName", label: "사용자", value: entry?.user },
                { id: "userDept", label: "부서", value: entry?.dept },
                { id: "endLoc", label: "도착지", value: entry?.end },
                { id: "purpose", label: "목적", value: entry?.purpose }
            ];

            for (const field of requiredFields) {
                const element = document.getElementById(field.id);
                const rawValue = field.value ?? element.value;
                const value = String(rawValue || "").trim();
                if (!value) {
                    alert(`${field.label} 항목을 입력해 주세요.`);
                    element.focus();
                    return false;
                }
            }

            return true;
        }

        form.addEventListener("submit", async function (event) {
            event.preventDefault();
            const key = document.getElementById("editKey").value;
            const entry = buildEntry();
            if (!validateRequiredFields(entry)) return;
            const submitBtn = document.getElementById("submitBtn");
            let savedKey = key;

            submitBtn.disabled = true;
            submitBtn.innerText = "저장 중";

            try {
                const targetRef = key ? db.child(key) : db.push();
                savedKey = key || targetRef.key;
                const uploadedReceipt = await uploadPendingReceipt(savedKey);

                if (uploadedReceipt) {
                    await deleteStoredReceipt(key ? logsData[key] : null);
                    Object.assign(entry, uploadedReceipt);
                }

                await targetRef.set(entry);
                lastPreviewRecord = { ...entry, key: savedKey };
                this.reset();
                document.getElementById("driveDate").valueAsDate = new Date();
                document.getElementById("editKey").value = "";
                clearReceiptState();
                render();
            } catch (error) {
                console.error(error);
                alert("저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerText = document.getElementById("editKey").value ? "내용 수정" : "DB 저장";
            }
        });

        receiptFileInput.addEventListener("change", (event) => {
            handleReceiptSelection(event.target.files[0], "file");
        });

        receiptCameraBtn.addEventListener("click", (event) => {
            event.preventDefault();
            openCameraModal();
        });
        cameraCaptureBtn.addEventListener("click", (event) => {
            event.preventDefault();
            captureCameraPhoto();
        });
        cameraUseBtn.addEventListener("click", (event) => {
            event.preventDefault();
            useCapturedPhoto();
        });
        cameraRetakeBtn.addEventListener("click", (event) => {
            event.preventDefault();
            retakeCameraPhoto();
        });
        cameraCloseBtn.addEventListener("click", (event) => {
            event.preventDefault();
            closeCameraCaptureModal();
        });

        formFieldIds.forEach((id) => {
            const element = document.getElementById(id);
            const eventName = element.type === "checkbox" || element.tagName === "SELECT" ? "change" : "input";
            element.addEventListener(eventName, () => render());
        });

        function saveCarNum() {}

        document.addEventListener("DOMContentLoaded", () => {
            document.getElementById("driveDate").valueAsDate = new Date();
            document.getElementById("carNumInput").value = "240하 2150";
            render();
        });
    
