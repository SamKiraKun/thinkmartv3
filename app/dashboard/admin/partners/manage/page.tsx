// File: ThinkMart/app/dashboard/admin/partners/manage/page.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAdminPartnersPageLike, updateAdminPartnerConfig } from '@/services/adminService';
import {
    Users, MapPin, Percent, Plus, X, Save, Loader2, RefreshCw,
    Shield, AlertTriangle, Search, Building
} from 'lucide-react';

interface Partner {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    assignedCity?: string;
    assignedCities?: string[];
    commissionPercentage?: number;
    commissionPercentages?: { [city: string]: number };
    partnerConfig?: {
        assignedCities?: string[];
        commissionPercentages?: { [city: string]: number };
        status?: string;
        assignedAt?: any;
        assignedBy?: string;
    } | null;
}

interface GetPartnersResponse {
    partners: Partner[];
    nextCursor: PartnersCursor | null;
    hasMore: boolean;
}

interface PartnersCursor {
    page: number;
}

interface CityAllocation {
    city: string;
    partners: { id: string; name: string; percentage: number }[];
    totalPercentage: number;
}

export default function AdminPartnerManagePage() {
    const [partners, setPartners] = useState<Partner[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
    const [cityAllocations, setCityAllocations] = useState<CityAllocation[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Edit state
    const [editCities, setEditCities] = useState<string[]>([]);
    const [editPercentages, setEditPercentages] = useState<{ [city: string]: number }>({});
    const [newCity, setNewCity] = useState('');

    const calculateCityAllocations = useCallback((partnerList: Partner[]) => {
        const cityMap: { [city: string]: { id: string; name: string; percentage: number }[] } = {};

        partnerList.forEach(partner => {
            const config = partner.partnerConfig;
            const assignedCities = config?.assignedCities?.length
                ? config.assignedCities
                : (partner.assignedCities?.length ? partner.assignedCities : (partner.assignedCity ? [partner.assignedCity] : []));
            const commissionPercentages = Object.keys(config?.commissionPercentages || {}).length
                ? (config?.commissionPercentages || {})
                : (Object.keys(partner.commissionPercentages || {}).length
                    ? (partner.commissionPercentages || {})
                    : (partner.assignedCity ? { [partner.assignedCity]: partner.commissionPercentage || 0 } : {}));

            assignedCities.forEach(city => {
                if (!cityMap[city]) cityMap[city] = [];
                cityMap[city].push({
                    id: partner.id,
                    name: partner.name,
                    percentage: commissionPercentages[city] || 0
                });
            });
        });

        const allocations: CityAllocation[] = Object.entries(cityMap).map(([city, partners]) => ({
            city,
            partners,
            totalPercentage: partners.reduce((sum, p) => sum + p.percentage, 0)
        }));

        setCityAllocations(allocations);
    }, []);

    const fetchPartners = useCallback(async () => {
        setLoading(true);
        setNotice(null);

        try {
            const allPartners: Partner[] = [];
            let cursor: PartnersCursor | null = null;
            let hasMore = true;

            while (hasMore) {
                const result: GetPartnersResponse = await fetchAdminPartnersPageLike(cursor?.page || 1, 30);
                const rows: Partner[] = result?.partners || [];

                const normalizedRows = rows.map((partner: Partner) => {
                    const config = partner.partnerConfig || { assignedCities: [], commissionPercentages: {} };
                    const assignedCities = config.assignedCities?.length
                        ? config.assignedCities
                        : (partner.assignedCities?.length
                            ? partner.assignedCities
                            : (partner.assignedCity ? [partner.assignedCity] : []));
                    const commissionPercentages = Object.keys(config.commissionPercentages || {}).length
                        ? config.commissionPercentages
                        : (Object.keys(partner.commissionPercentages || {}).length
                            ? (partner.commissionPercentages || {})
                            : (partner.assignedCity ? { [partner.assignedCity]: partner.commissionPercentage || 0 } : {}));

                    return {
                        ...partner,
                        city: partner.city || assignedCities[0] || '',
                        partnerConfig: {
                            ...config,
                            assignedCities,
                            commissionPercentages,
                        }
                    };
                });

                allPartners.push(...normalizedRows);
                hasMore = Boolean(result?.hasMore) && rows.length > 0;
                cursor = result?.nextCursor || null;
            }

            setPartners(allPartners);
            calculateCityAllocations(allPartners);
        } catch (error: unknown) {
            console.error('Failed to fetch partners:', error);
            setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Failed to load partners' });
        } finally {
            setLoading(false);
        }
    }, [calculateCityAllocations]);

    useEffect(() => {
        fetchPartners();
    }, [fetchPartners]);

    const openEditModal = (partner: Partner) => {
        const fallbackCities = partner.assignedCities?.length
            ? partner.assignedCities
            : (partner.assignedCity ? [partner.assignedCity] : []);
        const fallbackPercentages = Object.keys(partner.commissionPercentages || {}).length
            ? (partner.commissionPercentages || {})
            : (partner.assignedCity ? { [partner.assignedCity]: partner.commissionPercentage || 0 } : {});

        setSelectedPartner(partner);
        setEditCities(partner.partnerConfig?.assignedCities || fallbackCities);
        setEditPercentages(partner.partnerConfig?.commissionPercentages || fallbackPercentages);
        setNewCity('');
    };

    const addCity = () => {
        if (!newCity.trim()) return;
        const cityName = newCity.trim();
        if (editCities.includes(cityName)) {
            setNotice({ type: 'error', text: 'City already assigned.' });
            return;
        }
        setEditCities([...editCities, cityName]);
        setEditPercentages({ ...editPercentages, [cityName]: 0 });
        setNewCity('');
    };

    const removeCity = (city: string) => {
        setEditCities(editCities.filter(c => c !== city));
        const newPercs = { ...editPercentages };
        delete newPercs[city];
        setEditPercentages(newPercs);
    };

    const updatePercentage = (city: string, value: number) => {
        setEditPercentages({ ...editPercentages, [city]: Math.min(20, Math.max(0, value)) });
    };

    const validateAllocation = (city: string, newPercentage: number): boolean => {
        // Calculate total for this city including other partners
        const otherPartnersTotal = cityAllocations
            .find(c => c.city === city)
            ?.partners
            .filter(p => p.id !== selectedPartner?.id)
            .reduce((sum, p) => sum + p.percentage, 0) || 0;

        return (otherPartnersTotal + newPercentage) <= 20;
    };

    const savePartnerConfig = async () => {
        if (!selectedPartner) return;

        // Validate all percentages
        for (const city of editCities) {
            const perc = editPercentages[city] || 0;
            if (!validateAllocation(city, perc)) {
                setNotice({ type: 'error', text: `Total allocation for ${city} exceeds 20%. Please adjust.` });
                return;
            }
        }

        setSaving(selectedPartner.id);
        try {
            await updateAdminPartnerConfig(selectedPartner.id, {
                assignedCities: editCities,
                commissionPercentages: editPercentages,
            });

            await fetchPartners();
            setSelectedPartner(null);
            setNotice({ type: 'success', text: 'Partner configuration saved.' });
        } catch (err) {
            setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Save failed' });
        } finally {
            setSaving(null);
        }
    };

    const filteredPartners = partners.filter((partner) => {
        const query = searchTerm.toLowerCase();
        if (!query) return true;

        const cityFields = [
            partner.city,
            partner.assignedCity,
            ...(partner.partnerConfig?.assignedCities || [])
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

        return (
            partner.name?.toLowerCase().includes(query) ||
            partner.email?.toLowerCase().includes(query) ||
            cityFields.includes(query)
        );
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Users className="text-indigo-600" /> Partner Management
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Assign cities and commission percentages to partners</p>
                </div>
                <button
                    onClick={fetchPartners}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-2 transition disabled:opacity-50"
                >
                    <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {notice && (
                <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    <span className="text-sm font-medium">{notice.text}</span>
                    <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5" aria-label="Dismiss notice">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* City Allocation Overview */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-6 border border-indigo-100">
                <h2 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="text-indigo-600" size={18} /> City Commission Allocations
                </h2>
                {cityAllocations.length === 0 ? (
                    <p className="text-gray-500 text-sm">No city allocations yet. Assign cities to partners below.</p>
                ) : (
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {cityAllocations.map(city => (
                            <div key={city.city} className="bg-white rounded-lg p-4 shadow-sm border">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-bold text-gray-900">{city.city}</h3>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${city.totalPercentage > 20 ? 'bg-red-100 text-red-700' :
                                        city.totalPercentage === 20 ? 'bg-green-100 text-green-700' :
                                            'bg-yellow-100 text-yellow-700'
                                        }`}>
                                        {city.totalPercentage}% / 20%
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    {city.partners.map(p => (
                                        <div key={p.id} className="flex justify-between text-sm">
                                            <span className="text-gray-600">{p.name}</span>
                                            <span className="font-mono text-indigo-600">{p.percentage}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search partners by name, email, or city..."
                    className="w-full pl-10 pr-4 py-3 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>

            {/* Partners Table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                            <th className="px-6 py-4">Partner</th>
                            <th className="px-6 py-4">Assigned Cities</th>
                            <th className="px-6 py-4">Total Commission</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center">
                                    <Loader2 className="animate-spin mx-auto text-gray-400" size={32} />
                                </td>
                            </tr>
                        ) : filteredPartners.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="p-12 text-center text-gray-400">
                                    No partners found. Change user role to &quot;partner&quot; to add them here.
                                </td>
                            </tr>
                        ) : (
                            filteredPartners.map(partner => {
                                const cities = partner.partnerConfig?.assignedCities || [];
                                const percs = partner.partnerConfig?.commissionPercentages || {};
                                const totalPerc = Object.values(percs).reduce((sum, p) => sum + p, 0);

                                return (
                                    <tr key={partner.id} className="hover:bg-gray-50 transition">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                                                    <Shield size={18} className="text-purple-600" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{partner.name}</p>
                                                    <p className="text-xs text-gray-400">{partner.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {cities.length === 0 ? (
                                                <span className="text-gray-400 text-xs">No cities assigned</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {cities.map(city => (
                                                        <span key={city} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                                            {city} ({percs[city] || 0}%)
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono font-bold text-green-600">{totalPerc}%</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openEditModal(partner)}
                                                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-200 transition"
                                            >
                                                Configure
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit Modal */}
            {selectedPartner && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedPartner(null)} />

                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center z-10">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Configure Partner</h2>
                                <p className="text-sm text-gray-500">{selectedPartner.name}</p>
                            </div>
                            <button
                                onClick={() => setSelectedPartner(null)}
                                className="p-2 hover:bg-gray-100 rounded-lg"
                                aria-label="Close configure partner dialog"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* Add City */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Add City</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCity}
                                        onChange={(e) => setNewCity(e.target.value)}
                                        placeholder="Enter city name..."
                                        className="flex-1 p-3 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                        onKeyDown={(e) => e.key === 'Enter' && addCity()}
                                    />
                                    <button
                                        onClick={addCity}
                                        className="px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                                        aria-label="Add city"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>
                            </div>

                            {/* Assigned Cities */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Assigned Cities & Commission %
                                </label>
                                {editCities.length === 0 ? (
                                    <p className="text-gray-400 text-sm p-4 bg-gray-50 rounded-lg text-center">
                                        No cities assigned yet
                                    </p>
                                ) : (
                                    <div className="space-y-3">
                                        {editCities.map(city => {
                                            const isValid = validateAllocation(city, editPercentages[city] || 0);
                                            return (
                                                <div key={city} className={`p-4 rounded-lg border ${isValid ? 'bg-gray-50' : 'bg-red-50 border-red-200'}`}>
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <Building size={16} className="text-gray-500" />
                                                            <span className="font-medium">{city}</span>
                                                        </div>
                                                        <button
                                                            onClick={() => removeCity(city)}
                                                            className="p-1 text-red-500 hover:bg-red-100 rounded"
                                                            aria-label={`Remove ${city}`}
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="20"
                                                            step="1"
                                                            value={editPercentages[city] || 0}
                                                            onChange={(e) => updatePercentage(city, parseInt(e.target.value))}
                                                            className="flex-1"
                                                        />
                                                        <div className="flex items-center gap-1 w-20">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="20"
                                                                value={editPercentages[city] || 0}
                                                                onChange={(e) => updatePercentage(city, parseInt(e.target.value) || 0)}
                                                                className="w-14 p-2 border rounded text-center font-mono"
                                                            />
                                                            <Percent size={14} className="text-gray-400" />
                                                        </div>
                                                    </div>
                                                    {!isValid && (
                                                        <p className="text-red-600 text-xs mt-2 flex items-center gap-1">
                                                            <AlertTriangle size={12} /> Total exceeds 20% for this city
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Info */}
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
                                <p><strong>Note:</strong> Total commission per city cannot exceed 20%.
                                    This 20% pool is shared among all partners assigned to the city.</p>
                            </div>

                            {/* Save Button */}
                            <button
                                onClick={savePartnerConfig}
                                disabled={!!saving}
                                className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? (
                                    <><Loader2 className="animate-spin" size={18} /> Saving...</>
                                ) : (
                                    <><Save size={18} /> Save Configuration</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
