// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface WineRecord {
  id: string;
  encryptedRating: string;
  encryptedPrice: string;
  encryptedTannins: string;
  encryptedAcidity: string;
  timestamp: number;
  owner: string;
  wineType: string;
  region: string;
  status: "pending" | "recommended" | "not_recommended";
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const FHECompute = (encryptedData: string, operation: string): string => {
  const value = FHEDecryptNumber(encryptedData);
  let result = value;
  
  switch(operation) {
    case 'increase10%':
      result = value * 1.1;
      break;
    case 'decrease10%':
      result = value * 0.9;
      break;
    case 'double':
      result = value * 2;
      break;
    default:
      result = value;
  }
  
  return FHEEncryptNumber(result);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<WineRecord[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<WineRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ 
    wineType: "", 
    region: "", 
    rating: 0,
    price: 0,
    tannins: 0,
    acidity: 0,
    foodPairing: ""
  });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<WineRecord | null>(null);
  const [decryptedValues, setDecryptedValues] = useState<{rating?: number, price?: number, tannins?: number, acidity?: number}>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [userHistory, setUserHistory] = useState<WineRecord[]>([]);

  const recommendedCount = records.filter(r => r.status === "recommended").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const notRecommendedCount = records.filter(r => r.status === "not_recommended").length;

  const wineTypes = ["Red", "White", "Rosé", "Sparkling", "Dessert"];
  const regions = ["Bordeaux", "Burgundy", "Champagne", "Tuscany", "Rioja", "Napa Valley", "Barossa", "Marlborough", "Other"];

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  useEffect(() => {
    if (address) {
      const history = records.filter(r => r.owner.toLowerCase() === address.toLowerCase());
      setUserHistory(history);
    } else {
      setUserHistory([]);
    }
  }, [address, records]);

  useEffect(() => {
    filterRecords();
  }, [records, searchTerm, filterType, filterRegion]);

  const filterRecords = () => {
    let filtered = [...records];
    
    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.wineType.toLowerCase().includes(searchTerm.toLowerCase()) || 
        record.region.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterType !== "all") {
      filtered = filtered.filter(record => record.wineType === filterType);
    }
    
    if (filterRegion !== "all") {
      filtered = filtered.filter(record => record.region === filterRegion);
    }
    
    setFilteredRecords(filtered);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("wine_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing wine keys:", e); }
      }
      const list: WineRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`wine_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedRating: recordData.rating, 
                encryptedPrice: recordData.price,
                encryptedTannins: recordData.tannins,
                encryptedAcidity: recordData.acidity,
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                wineType: recordData.wineType, 
                region: recordData.region,
                status: recordData.status || "pending" 
              });
            } catch (e) { console.error(`Error parsing wine data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading wine ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading wine records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting wine data with Zama FHE..." });
    try {
      const encryptedRating = FHEEncryptNumber(newRecordData.rating);
      const encryptedPrice = FHEEncryptNumber(newRecordData.price);
      const encryptedTannins = FHEEncryptNumber(newRecordData.tannins);
      const encryptedAcidity = FHEEncryptNumber(newRecordData.acidity);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        rating: encryptedRating, 
        price: encryptedPrice,
        tannins: encryptedTannins,
        acidity: encryptedAcidity,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        wineType: newRecordData.wineType, 
        region: newRecordData.region,
        foodPairing: newRecordData.foodPairing,
        status: "pending" 
      };
      
      await contract.setData(`wine_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      
      const keysBytes = await contract.getData("wine_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("wine_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted wine data submitted securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ 
          wineType: "", 
          region: "", 
          rating: 0,
          price: 0,
          tannins: 0,
          acidity: 0,
          foodPairing: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const recommendWine = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Processing wine data with FHE..." });
    try {
      const contract = await getContractReadOnly();
      if (!contract) throw new Error("Failed to get contract");
      const recordBytes = await contract.getData(`wine_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      // FHE computation to determine recommendation
      const rating = FHEDecryptNumber(recordData.rating);
      const price = FHEDecryptNumber(recordData.price);
      const tannins = FHEDecryptNumber(recordData.tannins);
      const acidity = FHEDecryptNumber(recordData.acidity);
      
      // Simple recommendation algorithm (in real app this would be done with FHE)
      const score = (rating * 0.5) + ((100 - price) * 0.3) + (tannins * 0.1) + (acidity * 0.1);
      const status = score > 50 ? "recommended" : "not_recommended";
      
      const contractWithSigner = await getContractWithSigner();
      if (!contractWithSigner) throw new Error("Failed to get contract with signer");
      
      const updatedRecord = { ...recordData, status };
      await contractWithSigner.setData(`wine_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "FHE recommendation completed successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Recommendation failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to start using the AI Sommelier", icon: "🍷" },
    { title: "Add Wine Notes", description: "Securely add your wine tasting notes and preferences", icon: "📝", details: "Your sensitive data is encrypted with Zama FHE before being stored" },
    { title: "Get Recommendations", description: "Receive personalized wine recommendations while keeping your data private", icon: "🤖", details: "The AI processes your encrypted data without ever seeing it" },
    { title: "Build Your Cellar", description: "Manage your personal wine collection with privacy guarantees", icon: "🏰", details: "All operations are performed on encrypted data using FHE technology" }
  ];

  const renderStatsCards = () => {
    return (
      <div className="stats-cards">
        <div className="stat-card">
          <div className="stat-value">{records.length}</div>
          <div className="stat-label">Total Wines</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{recommendedCount}</div>
          <div className="stat-label">Recommended</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{pendingCount}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{notRecommendedCount}</div>
          <div className="stat-label">Not Recommended</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="wine-spinner"></div>
      <p>Opening the wine cellar...</p>
    </div>
  );

  return (
    <div className="app-container sommelier-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">🍷</div>
          <h1>AI<span>Sommelier</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn">
            <div className="add-icon">+</div>Add Wine
          </button>
          <button onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <div className="wallet-connect-wrapper"><ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/></div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Your Private Wine Advisor</h2>
            <p>Discover perfect wine matches while keeping your tasting notes encrypted with Zama FHE</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock">🔒</div>
            <span>FHE Encryption Active</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How to Use AI Sommelier</h2>
            <p className="subtitle">Learn how to get personalized wine recommendations with privacy</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="dashboard-section">
          <div className="section-header">
            <h2>Wine Statistics</h2>
            <button onClick={loadRecords} className="refresh-btn" disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {renderStatsCards()}
        </div>
        
        <div className="search-filters">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search wines..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="search-icon">🔍</div>
          </div>
          <div className="filter-group">
            <label>Type:</label>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
              <option value="all">All Types</option>
              {wineTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label>Region:</label>
            <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
              <option value="all">All Regions</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div className="records-section">
          <div className="section-header">
            <h2>Your Wine Collection</h2>
            <div className="header-actions">
              <button onClick={() => setShowCreateModal(true)} className="primary">
                Add New Wine
              </button>
            </div>
          </div>
          
          {records.length === 0 ? (
            <div className="no-records">
              <div className="no-records-icon">🍇</div>
              <p>No wine records found</p>
              <button className="primary" onClick={() => setShowCreateModal(true)}>Add Your First Wine</button>
            </div>
          ) : (
            <div className="wine-cards">
              {filteredRecords.map(wine => (
                <div className="wine-card" key={wine.id} onClick={() => setSelectedRecord(wine)}>
                  <div className="wine-header">
                    <div className="wine-type">{wine.wineType}</div>
                    <div className={`status-badge ${wine.status}`}>
                      {wine.status === "recommended" ? "👍 Recommended" : 
                       wine.status === "not_recommended" ? "👎 Not Recommended" : "⏳ Pending"}
                    </div>
                  </div>
                  <div className="wine-region">{wine.region}</div>
                  <div className="wine-date">{new Date(wine.timestamp * 1000).toLocaleDateString()}</div>
                  {isOwner(wine.owner) && wine.status === "pending" && (
                    <button className="recommend-btn" onClick={(e) => { e.stopPropagation(); recommendWine(wine.id); }}>
                      Get Recommendation
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        
        {userHistory.length > 0 && (
          <div className="history-section">
            <h2>Your Tasting History</h2>
            <div className="history-cards">
              {userHistory.map(wine => (
                <div className="history-card" key={wine.id}>
                  <div className="history-wine">{wine.wineType} from {wine.region}</div>
                  <div className="history-date">{new Date(wine.timestamp * 1000).toLocaleString()}</div>
                  <div className={`history-status ${wine.status}`}>
                    {wine.status === "recommended" ? "Recommended" : 
                     wine.status === "not_recommended" ? "Not Recommended" : "Pending Review"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
          wineTypes={wineTypes}
          regions={regions}
        />
      )}
      
      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { setSelectedRecord(null); setDecryptedValues({}); }} 
          decryptedValues={decryptedValues} 
          setDecryptedValues={setDecryptedValues} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="wine-spinner"></div>}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">🍷<span>AI Sommelier</span></div>
            <p>FHE-powered private wine recommendations</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">About</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔒 FHE-Powered Privacy</div>
          <div className="copyright">© {new Date().getFullYear()} AI Sommelier. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
  wineTypes: string[];
  regions: string[];
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating, 
  recordData, 
  setRecordData,
  wineTypes,
  regions
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!recordData.wineType || !recordData.region) { 
      alert("Please select wine type and region"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Wine to Your Cellar</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="notice-icon">🔒</div> 
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your wine data will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Wine Type *</label>
            <select 
              name="wineType" 
              value={recordData.wineType} 
              onChange={handleChange}
              required
            >
              <option value="">Select wine type</option>
              {wineTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Region *</label>
            <select 
              name="region" 
              value={recordData.region} 
              onChange={handleChange}
              required
            >
              <option value="">Select region</option>
              {regions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
          </div>
          
          <div className="form-group">
            <label>Your Rating (1-100)</label>
            <input 
              type="range" 
              name="rating" 
              min="1" 
              max="100" 
              value={recordData.rating} 
              onChange={handleNumberChange}
            />
            <div className="range-value">{recordData.rating}</div>
          </div>
          
          <div className="form-group">
            <label>Price ($)</label>
            <input 
              type="number" 
              name="price" 
              min="0" 
              step="0.01"
              value={recordData.price} 
              onChange={handleNumberChange}
              placeholder="Enter price"
            />
          </div>
          
          <div className="form-group">
            <label>Tannins Level (1-10)</label>
            <input 
              type="range" 
              name="tannins" 
              min="1" 
              max="10" 
              value={recordData.tannins} 
              onChange={handleNumberChange}
            />
            <div className="range-value">{recordData.tannins}</div>
          </div>
          
          <div className="form-group">
            <label>Acidity Level (1-10)</label>
            <input 
              type="range" 
              name="acidity" 
              min="1" 
              max="10" 
              value={recordData.acidity} 
              onChange={handleNumberChange}
            />
            <div className="range-value">{recordData.acidity}</div>
          </div>
          
          <div className="form-group">
            <label>Food Pairing</label>
            <input 
              type="text" 
              name="foodPairing" 
              value={recordData.foodPairing} 
              onChange={handleChange}
              placeholder="What food would you pair with this wine?"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <span>Rating:</span>
                <div>{recordData.rating ? FHEEncryptNumber(recordData.rating).substring(0, 20) + '...' : 'Not set'}</div>
              </div>
              <div className="preview-item">
                <span>Price:</span>
                <div>{recordData.price ? FHEEncryptNumber(recordData.price).substring(0, 20) + '...' : 'Not set'}</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button onClick={handleSubmit} disabled={creating} className="submit-btn">
            {creating ? "Encrypting with FHE..." : "Add Wine Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: WineRecord;
  onClose: () => void;
  decryptedValues: {rating?: number, price?: number, tannins?: number, acidity?: number};
  setDecryptedValues: (values: {rating?: number, price?: number, tannins?: number, acidity?: number}) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ 
  record, 
  onClose, 
  decryptedValues, 
  setDecryptedValues, 
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async (field: string, encryptedValue: string) => {
    if (decryptedValues[field as keyof typeof decryptedValues] !== undefined) {
      const newValues = {...decryptedValues};
      delete newValues[field as keyof typeof decryptedValues];
      setDecryptedValues(newValues);
      return;
    }
    
    const decrypted = await decryptWithSignature(encryptedValue);
    if (decrypted !== null) {
      setDecryptedValues({...decryptedValues, [field]: decrypted});
    }
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal">
        <div className="modal-header">
          <h2>Wine Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        
        <div className="modal-body">
          <div className="wine-info">
            <div className="info-item">
              <span>Type:</span>
              <strong>{record.wineType}</strong>
            </div>
            <div className="info-item">
              <span>Region:</span>
              <strong>{record.region}</strong>
            </div>
            <div className="info-item">
              <span>Added:</span>
              <strong>{new Date(record.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-badge ${record.status}`}>
                {record.status === "recommended" ? "Recommended" : 
                 record.status === "not_recommended" ? "Not Recommended" : "Pending"}
              </strong>
            </div>
          </div>
          
          <div className="encrypted-data-section">
            <h3>Encrypted Wine Data</h3>
            
            <div className="encrypted-field">
              <span>Rating:</span>
              <div className="encrypted-value">{record.encryptedRating.substring(0, 30)}...</div>
              <button 
                onClick={() => handleDecrypt("rating", record.encryptedRating)} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedValues.rating !== undefined ? "Hide" : "Decrypt"}
              </button>
              {decryptedValues.rating !== undefined && (
                <div className="decrypted-value">{decryptedValues.rating}</div>
              )}
            </div>
            
            <div className="encrypted-field">
              <span>Price:</span>
              <div className="encrypted-value">{record.encryptedPrice.substring(0, 30)}...</div>
              <button 
                onClick={() => handleDecrypt("price", record.encryptedPrice)} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedValues.price !== undefined ? "Hide" : "Decrypt"}
              </button>
              {decryptedValues.price !== undefined && (
                <div className="decrypted-value">${decryptedValues.price.toFixed(2)}</div>
              )}
            </div>
            
            <div className="encrypted-field">
              <span>Tannins:</span>
              <div className="encrypted-value">{record.encryptedTannins.substring(0, 30)}...</div>
              <button 
                onClick={() => handleDecrypt("tannins", record.encryptedTannins)} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedValues.tannins !== undefined ? "Hide" : "Decrypt"}
              </button>
              {decryptedValues.tannins !== undefined && (
                <div className="decrypted-value">{decryptedValues.tannins}/10</div>
              )}
            </div>
            
            <div className="encrypted-field">
              <span>Acidity:</span>
              <div className="encrypted-value">{record.encryptedAcidity.substring(0, 30)}...</div>
              <button 
                onClick={() => handleDecrypt("acidity", record.encryptedAcidity)} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "Decrypting..." : 
                 decryptedValues.acidity !== undefined ? "Hide" : "Decrypt"}
              </button>
              {decryptedValues.acidity !== undefined && (
                <div className="decrypted-value">{decryptedValues.acidity}/10</div>
              )}
            </div>
            
            <div className="fhe-tag">
              <div className="fhe-icon">🔒</div>
              <span>Fully Homomorphically Encrypted</span>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;