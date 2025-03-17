/** @odoo-module **/

import { registry } from '@web/core/registry';
import { Component, onMounted, useState } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { useService } from "@web/core/utils/hooks";

export class AnalyticDashboard extends Component {
    static template = 'owl.AnalyticDashboard';

    state = useState({
        projetsTerminesCount: 0,
        projetsEnCoursCount: 0,
        resultatChantierTotal: 0,
        progressionMoyenne: 0,
        statistiquesProjets: {},
        projetsData: [],
        projetsEnCours: [],
        projetsTermines: [],
        plansData: []
    });

    setup() {
        this.action = useService("action");

        // Méthode pour initialiser le dashboard
        this.onClickUpdateDashboard = async () => {
            console.log("Mise à jour du tableau de bord...");

            try {
                // Lancer la mise à jour du dashboard
                await rpc('/dashboard/update_dashboard', {});

                // Exécuter les appels RPC en parallèle
                const [projets, resultatTotal, progressionMoyenne, stats] = await Promise.all([
                    this.loadProjets(),
                    this.loadResultatChantierTotal(),
                    this.loadProgressionMoyenne(),
                    this.loadStatistiquesProjets()
                ]);

                // Générer les graphiques après avoir reçu toutes les données
                this.generateChart();
            } catch (error) {
                console.error("Erreur lors de l'appel RPC :", error);
            }
        };



        // Une fois le composant monté
        onMounted(async () => {
            // 1) Mettre à jour le tableau analytique
            await this.onClickUpdateDashboard();

            // 2) Charger la liste des plans
            await this.loadPlans();

            // 3) Charger les stats globales
            await this.loadStatistiquesProjets();

            // 4) Installer les divers listeners
            this._eventListenersChart();

            // 5) Gérer les clics sur "Projets terminés" et "Projets en cours"
            const completedProjectsCard = document.getElementById('completed-projects-card');
            if (completedProjectsCard) {
                completedProjectsCard.addEventListener('click', () => {
                    this.showCompletedProjects();
                });
            }
            const ongoingProjectsCard = document.getElementById('ongoing-projects-card');
            if (ongoingProjectsCard) {
                ongoingProjectsCard.addEventListener('click', () => {
                    this.showOngoingProjects();
                });
            }
        });
    }

    // ===========================================================
    // =========== Méthode d'installation des listeners ==========
    // ===========================================================
    _eventListenersChart() {
        // Toggle du style switcher
        document.querySelectorAll('.style-switcher-toggler').forEach(el => {
            el.addEventListener('click', () => {
                const styleSwitcher = document.querySelector('.style-switcher');
                if (styleSwitcher) {
                    styleSwitcher.classList.toggle('open');
                }
            });
        });

        // Gestion des selects
        const planSelect = document.getElementById('planSelect');
        const dataSelect = document.getElementById('dataSelect');
        if (planSelect) {
            planSelect.addEventListener("change", async () => {
                await this.loadProjets();
                await this.loadResultatChantierTotal();
                await this.loadProgressionMoyenne();
            });
        }
        if (dataSelect) {
            dataSelect.addEventListener("change", () => this.loadProjets());
        }

        // Recherche dynamique
        const searchProjectInput = document.getElementById('search-project-code');
        if (searchProjectInput) {
            searchProjectInput.addEventListener('input', (event) => {
                const searchTerm = event.target.value.toLowerCase();
                const filteredProjets = this.state.projetsEnCours.concat(this.state.projetsTermines).filter(projet =>
                    projet.code_projet.toLowerCase().includes(searchTerm)
                );
                this.updateProjectsTable(filteredProjets);
            });
        }

        // Sélecteur de période
        const periodSelector = document.getElementById('period-selector');
        const dateRangeDiv = document.getElementById('date-range');
        const periodLabel = document.getElementById('period-label');
        const applyButton = document.querySelector('.btn-submit');

        // Dates par défaut (année en cours)
        const today = new Date();
        const thisYearStart = new Date(today.getFullYear(), 0, 1);
        const thisYearEnd = new Date(today.getFullYear(), 11, 31);
        const defaultDateFilter = {
            start: thisYearStart.toISOString().split('T')[0],
            end: thisYearEnd.toISOString().split('T')[0]
        };


        // On positionne "this-year" par défaut
        if (periodSelector) {
            periodSelector.value = 'this-year';
        }
        if (periodLabel) {
            periodLabel.textContent = "de l'année en cours";
        }

        // Charger les données initiales
        this.loadProjets(defaultDateFilter);
        this.loadResultatChantierTotal(defaultDateFilter);
        this.loadProgressionMoyenne(defaultDateFilter);

        // Event sur le periodSelector
        if (periodSelector) {
            periodSelector.addEventListener('change', () => {
                if (periodSelector.value === 'custom') {
                    dateRangeDiv.classList.remove('hidden');
                    periodLabel.textContent = "pour la période personnalisée";
                } else {
                    dateRangeDiv.classList.add('hidden');
                    switch (periodSelector.value) {
                        case 'this-month':
                            periodLabel.textContent = "du mois en cours";
                            break;
                        case 'last-month':
                            periodLabel.textContent = "du mois précédent";
                            break;
                        case 'this-year':
                            periodLabel.textContent = "de l'année";
                            break;
                    }
                    this.applyDateFilter();
                }
            });
        }

        // Bouton "Appliquer" pour la période custom
        if (applyButton) {
            applyButton.addEventListener('click', () => this.applyDateFilter());
        }
    }

    // ===========================================================
    // =========== Application du filtre de période =============
    // ===========================================================
    applyDateFilter() {
        const periodSelector = document.getElementById('period-selector');
        const periodLabel = document.getElementById('period-label');
        const startDate = document.getElementById('start-date')?.value;
        const endDate = document.getElementById('end-date')?.value;
        const today = new Date();

        let dateFilter = {};

        if (periodSelector.value === 'last-month') {
            const year = today.getMonth() === 0 ? today.getFullYear() - 1 : today.getFullYear();
            const lastMonth = today.getMonth() === 0 ? 11 : today.getMonth() - 1;
            dateFilter = {
                start: new Date(year, lastMonth, 1).toISOString().split('T')[0],
                end: new Date(year, lastMonth + 1, 0).toISOString().split('T')[0]
            };
            periodLabel.textContent = "du mois précédent";
        }
        else if (periodSelector.value === 'this-month') {
            dateFilter = {
                start: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0],
                end: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]
            };
            periodLabel.textContent = "du mois en cours";
        }
        else if (periodSelector.value === 'this-year') {
            dateFilter = {
                start: new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0],
                end: new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0]
            };
            periodLabel.textContent = "de l'année";
        }
        else if (periodSelector.value === 'custom' && startDate && endDate) {
            dateFilter = { start: startDate, end: endDate };
            periodLabel.textContent = `du ${startDate} au ${endDate}`;
        }

        this.loadProjets(dateFilter);
        this.loadResultatChantierTotal(dateFilter);
        this.loadProgressionMoyenne(dateFilter);
        this.loadStatistiquesProjets();
        this.generateChart();
    }

    // ===========================================================
    // ============ Chargement des données générales ============
    // ===========================================================
    async loadStatistiquesProjets() {
        try {
            const result = await rpc('/dashboard/statistiques_projets', {});
            this.state.statistiquesProjets = result || {};
        } catch (error) {
            console.error("Erreur lors de la récupération des stats_projets :", error);
        }
    }

    async loadResultatChantierTotal(dateFilter = {}) {
        try {
            // Récupérer le plan sélectionné
            const selectedPlan = document.getElementById('planSelect').value;

            let planId = null;
            // Si l'utilisateur a choisi un plan spécifique
            if (selectedPlan && selectedPlan !== "plans_data" && selectedPlan !== "all_project_code") {
                planId = parseInt(selectedPlan);
            }

            // Préparer les params pour le RPC
            const params = {
                start: dateFilter.start || null,
                end: dateFilter.end || null,
                plan_id: planId,
            };

            // Appel RPC en passant plan_id
            const result = await rpc('/dashboard/resultat_chantier_total', params);
            const total = Math.round(result?.resultat_chantier_total || 0);

            // Mettre à jour l'état
            this.state.resultatChantierTotal = total.toLocaleString();
        } catch (error) {
            console.error("Erreur lors de la récupération du résultat chantier total :", error);
        }
    }

    async loadProgressionMoyenne(dateFilter = {}) {
        try {
            // Récupérer le plan sélectionné
            const selectedPlan = document.getElementById('planSelect').value;

            let planId = null;
            if (selectedPlan && selectedPlan !== "plans_data" && selectedPlan !== "all_project_code") {
                planId = parseInt(selectedPlan);
            }

            // Préparer les params pour le RPC
            const params = {
                start: dateFilter.start || null,
                end: dateFilter.end || null,
                plan_id: planId,
            };

            // Appel RPC en passant plan_id
            const result = await rpc('/dashboard/progression_moyenne', params);
            const progression = result?.progression_moyenne || 0;

            if (typeof progression === 'number' && !isNaN(progression)) {
                this.state.progressionMoyenne = (progression * 100).toFixed(2);
            } else {
                this.state.progressionMoyenne = '0.00';
            }
        } catch (error) {
            console.error("Erreur lors de la récupération de la progression moyenne :", error);
            this.state.progressionMoyenne = '0.00';
        }
    }

    // ===========================================================
    // ========== Récupérer la liste des plans (header) =========
    // ===========================================================
    async loadPlans() {
        try {
            const response = await rpc('/dashboard/liste_plans', {});
            if (!response || response.status !== "success" || !response.data || !response.data.plans) {
                console.error("Aucun plan trouvé ou réponse invalide :", response);
                return;
            }
            const plans = response.data.plans;
            this.state.plansData = plans;

            const planSelect = document.getElementById('planSelect');
            if (!planSelect) {
                return;
            }
            planSelect.innerHTML = '';

            // Option "Sélectionnez ..."
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "Sélectionnez une Exploitation";
            defaultOption.disabled = true;
            planSelect.appendChild(defaultOption);

            // Option "Toutes les exploitations"
            const plansDataOption = document.createElement('option');
            plansDataOption.value = "plans_data";
            plansDataOption.textContent = "Toutes les exploitations";
            planSelect.appendChild(plansDataOption);

            // Option "Tous les codes projets"
            const allPlansOption = document.createElement('option');
            allPlansOption.value = "all_project_code";
            allPlansOption.textContent = "Tous les codes projets";
            planSelect.appendChild(allPlansOption);

            // Ajouter dynamiquement les plans
            plans.forEach(plan => {
                const opt = document.createElement('option');
                opt.value = plan.id;
                opt.textContent = plan.name;
                planSelect.appendChild(opt);
            });

            // Sélectionner "plans_data"
            plansDataOption.selected = true;

        } catch (error) {
            console.error("Erreur lors de la récupération des plans:", error);
        }
    }

    // ===========================================================
    // =============== Chargement des projets ====================
    // ===========================================================
    async loadProjets(dateFilter = {}) {
        try {
            // 1) Récupération des sélections (Plan, DataSelect)
            const selectedPlan = document.getElementById('planSelect').value;
            const selectedData = document.getElementById('dataSelect').value || "resultat_chantier_cumule";

            // 2) Paramètres à envoyer au contrôleur
            let params = {
                start: dateFilter.start || null,
                end: dateFilter.end || null,
                plan_id: null,
            };
            if (selectedPlan && selectedPlan !== "plans_data" && selectedPlan !== "all_project_code") {
                params.plan_id = parseInt(selectedPlan);
            }

            // 3) Appel RPC => Projets PÉRIODISÉS (invoice_date)
            const allProjets = await rpc('/dashboard/liste_projets', params);
            if (!Array.isArray(allProjets)) {
                console.error("Réponse non tableau:", allProjets);
                return;
            }

            // 4) On applique la logique planSelect
            let filteredProjets = allProjets;
            if (selectedPlan === "plans_data") {
                // Graphique => cumul plan => this.state.plansData
                this.state.projetsData = this.state.plansData.map(plan => ({
                    code: plan.name,
                    value: plan[selectedData],
                    id: plan.id,
                }));
            }
            else if (selectedPlan === "all_project_code") {
                this.state.projetsData = filteredProjets.map(projet => ({
                    code: projet.code_projet,
                    value: projet[selectedData],
                    id: projet.id_code_project,
                }));
            }
            else if (selectedPlan) {
                // Filtrer par plan_id (logique front)
                filteredProjets = filteredProjets.filter(
                    p => p.plan_id === parseInt(selectedPlan)
                );
                this.state.projetsData = filteredProjets.map(projet => ({
                    code: projet.code_projet,
                    value: projet[selectedData],
                    id: projet.id_code_project,
                }));
            }
            else {
                // Aucune sélection => On affiche la liste des plans
                this.state.projetsData = this.state.plansData.map(plan => ({
                    code: plan.name,
                    value: plan[selectedData],
                    id: plan.id,
                }));
            }

            // 5) Projets en cours / terminés
            this.state.projetsEnCours = filteredProjets.filter(p => p.pourcentage_avancement < 1);
            this.state.projetsTermines = filteredProjets.filter(p => p.pourcentage_avancement >= 1);
            this.state.projetsEnCoursCount = this.state.projetsEnCours.length;
            this.state.projetsTerminesCount = this.state.projetsTermines.length;

            // 6) Mettre à jour le tableau
            this.updateProjectsTable(filteredProjets);

            // 7) Générer le graph
            this.generateChart(selectedData);

        } catch (error) {
            console.error("Erreur loadProjets:", error);
        }
    }

    updateProjectsTable(listProjets) {
        const tableBody = document.getElementById('projects-table-body');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        listProjets.forEach(projet => {
            const row = document.createElement('tr');

            // Code Projet
            const codeCell = document.createElement('td');
            const codeTxt = document.createElement('h6');
            codeTxt.classList.add('text-sm');
            codeTxt.textContent = projet.code_projet;
            codeCell.appendChild(codeTxt);
            row.appendChild(codeCell);

            // Budget
            const budgetCell = document.createElement('td');
            budgetCell.classList.add('text-center');
            budgetCell.textContent = projet.ca_final ? Math.round(projet.ca_final).toLocaleString() : '0';
            row.appendChild(budgetCell);

            // Avancement
            const progressCell = document.createElement('td');
            const progressWrapper = document.createElement('div');
            progressWrapper.classList.add('progress-wrapper', 'w-75', 'mx-auto');
            const progressBarContainer = document.createElement('div');
            progressBarContainer.classList.add('progress');
            const progressBar = document.createElement('div');
            progressBar.classList.add('progress-bar', 'bg-gradient-info');
            progressBar.style.width = `${(projet.pourcentage_avancement * 100).toFixed(0)}%`;
            progressBarContainer.appendChild(progressBar);
            progressWrapper.appendChild(progressBarContainer);
            const progressText = document.createElement('small');
            progressText.textContent = `${(projet.pourcentage_avancement * 100).toFixed(0)}%`;
            progressWrapper.appendChild(progressText);
            progressCell.appendChild(progressWrapper);
            row.appendChild(progressCell);

            // Clic => naviguer
            row.addEventListener('click', () => {
                this.navigateToProjet(projet.id_code_project, projet.code_projet);
            });

            tableBody.appendChild(row);
        });
    }

    // ===========================================================
    // ================= Génération du graphique =================
    // ===========================================================
    generateChart(selectedDataLabel = "Résultat Chantier (CFA)") {
        const ctx = document.getElementById('ResultatChart')?.getContext('2d');
        const noDataMessage = document.getElementById('noDataMessage');
        if (!ctx || !noDataMessage) return;

        // Si un graphique existait déjà, on le détruit
        if (this.chart) {
            this.chart.destroy();
        }

        // S'il n'y a pas de data
        if (!this.state.projetsData || !this.state.projetsData.length) {
            noDataMessage.style.display = 'block';
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        let filteredProjets = this.state.projetsData.filter(p => p.value !== 0);

        // Correction si "Dépenses Cumulées"
        if (selectedDataLabel === "Dépenses Cumulées") {
            filteredProjets = filteredProjets.map(p => ({
                ...p,
                value: Math.abs(p.value)
            }));
        }

        if (!filteredProjets.length) {
            noDataMessage.style.display = 'block';
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        noDataMessage.style.display = 'none';

        const labels = filteredProjets.map(p => p.code);
        const data = filteredProjets.map(p => p.value);
        const ids = filteredProjets.map(p => p.id);

        const backgroundColors = [
            '#42A5F5', '#66BB6A', '#FFA726', '#FF7043', '#8D6E63',
            '#AB47BC', '#26C6DA', '#FFEE58', '#D4E157', '#EC407A'
        ];

        this.chart = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    label: selectedDataLabel,
                    data: data,
                    backgroundColor: backgroundColors.slice(0, data.length),
                }],
            },
            options: {
                responsive: true,
                onClick: (event) => {
                    const activePoints = this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
                    if (activePoints.length) {
                        const firstPoint = activePoints[0];
                        const projetId = ids[firstPoint.index];
                        const projetCode = labels[firstPoint.index];
                        const selectedPlan = document.getElementById('planSelect').value;

                        // On dirige vers plan ou projet
                        if (selectedPlan === "plans_data") {
                            this.navigateToPlan(projetId, projetCode);
                        } else {
                            this.navigateToProjet(projetId, projetCode);
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const i = context.dataIndex;
                                const val = context.raw;
                                return `Code: ${labels[i]}, Valeur: ${val.toLocaleString()} CFA`;
                            },
                        },
                    },
                    legend: {
                        position: 'top',
                    },
                },
            },
        });
    }

    // ===========================================================
    // ======================= Navigation ========================
    // ===========================================================
    navigateToPlan(planId, planCode) {
        console.log(`Vous tentez d'accéder au plan : ID = ${planId}, Nom = ${planCode}`);
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: `Exploitation ${planCode}`,
            res_model: 'analytic.dashboard',
            views: [[false, "list"], [false, "form"]],
            target: 'current',
            domain: [['plan_id', '=', planId]],
        });
    }

    navigateToProjet(projetId, projetCode) {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: `Détails du projet ${projetCode}`,
            res_model: 'analytic.dashboard',
            views: [[false, "list"], [false, "form"]],
            target: 'current',
            domain: [['name.id', '=', projetId]],
        });
    }

    // ===========================================================
    // ================== Afficher projets =======================
    // ===========================================================
    showCompletedProjects() {
        // Projets terminés: avancement >= 1
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Projets Terminés',
            res_model: 'analytic.dashboard',
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
            domain: [['pourcentage_avancement_stored', '>=', 1]],
        });
    }

    showOngoingProjects() {
        // Projets en cours: avancement < 1
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Projets en Cours',
            res_model: 'analytic.dashboard',
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
            domain: [['pourcentage_avancement_stored', '<', 1]],
        });
    }
}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);