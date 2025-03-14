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

        // Méthode pour mettre à jour le dashboard
        this.onClickUpdateDashboard = async () => {
            try {
                await rpc('/dashboard/update_dashboard', {});
            } catch (error) {
                console.error("Erreur lors de l'appel RPC :", error);
            }
        };

        onMounted(async () => {
            // 1) Mettre à jour le dashboard (créer/MAJ les enregistrements si besoin)
            await this.onClickUpdateDashboard();

            // 2) Charger la liste des plans (mais pas encore les projets)
            await this.loadPlans();

            // 3) Charger quelques stats globales (statistiquesProjets)
            await this.loadStatistiquesProjets();

            // 4) Installer les listeners (ce qui va déclencher le chargement par dateFilter)
            this._eventListenersChart();

            // 5) Gérer les clics sur "Projets terminés" / "Projets en cours"
            const completedProjectsCard = document.getElementById('completed-projects-card');
            completedProjectsCard.addEventListener('click', () => {
                this.showCompletedProjects();
            });

            const ongoingProjectsCard = document.getElementById('ongoing-projects-card');
            ongoingProjectsCard.addEventListener('click', () => {
                this.showOngoingProjects();
            });
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

        // Attacher les événements dynamiquement
        const planSelect = document.getElementById('planSelect');
        const dataSelect = document.getElementById('dataSelect');
        if (planSelect) {
            planSelect.addEventListener("change", () => this.loadProjets());
        }
        if (dataSelect) {
            dataSelect.addEventListener("change", () => this.loadProjets());
        }

        // ==== Gestion de la recherche dynamique ====
        document.getElementById('search-project-code').addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase();
            const filteredProjets = this.state.projetsEnCours.concat(this.state.projetsTermines).filter(projet =>
                projet.code_projet.toLowerCase().includes(searchTerm)
            );

            const tableBody = document.getElementById('projects-table-body');
            tableBody.innerHTML = '';

            filteredProjets.forEach(projet => {
                const row = document.createElement('tr');

                // Code Projet
                const codeProjetCell = document.createElement('td');
                const codeProjetText = document.createElement('h6');
                codeProjetText.classList.add('text-sm');
                codeProjetText.textContent = projet.code_projet;
                codeProjetCell.appendChild(codeProjetText);
                row.appendChild(codeProjetCell);

                // Budget (CFA)
                const budgetCell = document.createElement('td');
                budgetCell.classList.add('text-center');
                budgetCell.textContent = projet.ca_final ? projet.ca_final.toLocaleString() : '0';
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

                // Gestionnaire de clic sur la ligne
                row.addEventListener('click', () => {
                    this.navigateToProjet(projet.id_code_project, projet.code_projet);
                });

                tableBody.appendChild(row);
            });
        });

        // ==== Sélecteur de période ====
        const periodSelector = document.getElementById('period-selector');
        const dateRangeDiv = document.getElementById('date-range');
        const periodLabel = document.getElementById('period-label');
        const applyButton = document.querySelector('.btn-submit');

        // Dates par défaut pour "mois en cours"
        const today = new Date();
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        // Appliquer un dateFilter par défaut
        const defaultDateFilter = {
            start: thisMonthStart.toISOString().split('T')[0],
            end: thisMonthEnd.toISOString().split('T')[0]
        };

        // On positionne "this-year" par défaut
        periodSelector.value = 'this-year';
        periodLabel.textContent = "de l'année en cours";

        // 1) Charger les données initiales (au lieu de onMounted)
        this.loadProjets(defaultDateFilter);
        this.loadResultatChantierTotal(defaultDateFilter);
        this.loadProgressionMoyenne(defaultDateFilter);

        // 🎯 Quand on change le select
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

        // 🗓️ Bouton "Appliquer" pour le custom
        applyButton.addEventListener('click', () => this.applyDateFilter());
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
            periodLabel.textContent = "de cette année";
        }
        else if (periodSelector.value === 'custom' && startDate && endDate) {
            dateFilter = { start: startDate, end: endDate };
            periodLabel.textContent = `du ${startDate} au ${endDate}`;
        }

        // Rechargement des données
        this.loadProjets(dateFilter);
        this.loadResultatChantierTotal(dateFilter);
        this.loadProgressionMoyenne(dateFilter);
    }

    // ===========================================================
    // ============== Chargement des données générales ===========
    // ===========================================================
    async loadStatistiquesProjets() {
        try {
            const result = await rpc('/dashboard/statistiques_projets', {});
            this.state.statistiquesProjets = result || {};
        } catch (error) {
            console.error("Erreur lors de la récupération des statistiques des projets :", error);
        }
    }

    async loadResultatChantierTotal(dateFilter = {}) {
        try {
            const result = await rpc('/dashboard/resultat_chantier_total', dateFilter);
            const total = Math.round(result?.resultat_chantier_total || 0);
            this.state.resultatChantierTotal = total.toLocaleString();
        } catch (error) {
            console.error("Erreur lors de la récupération du résultat chantier total :", error);
        }
    }

    async loadProgressionMoyenne(dateFilter = {}) {
        try {
            const result = await rpc('/dashboard/progression_moyenne', dateFilter);
            const progression = result?.progression_moyenne || 0;

            if (typeof progression === 'number' && !isNaN(progression)) {
                this.state.progressionMoyenne = (progression * 100).toFixed(2);
            } else {
                this.state.progressionMoyenne = '0.00';
                console.error("Progression moyenne invalide:", progression);
            }
        } catch (error) {
            console.error("Erreur loadProgressionMoyenne :", error);
            this.state.progressionMoyenne = '0.00';
        }
    }

    // ===========================================================
    // ========= Récupérer la liste des plans (header) ==========
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
            planSelect.innerHTML = '';

            // Option par défaut
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
                const option = document.createElement('option');
                option.value = plan.id;
                option.textContent = plan.name;
                planSelect.appendChild(option);
            });

            // Sélectionner automatiquement "plans_data"
            plansDataOption.selected = true;

        } catch (error) {
            console.error("Erreur lors de la récupération des plans :", error);
        }
    }

    // ===========================================================
    // ============== Chargement des projets =====================
    // ===========================================================
    async loadProjets(dateFilter = {}) {
        try {
            const selectedPlan = document.getElementById('planSelect').value;
            const selectedData = document.getElementById('dataSelect').value || "resultat_chantier_cumule";

            // Récupère TOUTES les données projets (non filtrées)
            const allProjets = await rpc('/dashboard/liste_projets', {});

            if (!Array.isArray(allProjets)) {
                console.error("La réponse n'est pas un tableau :", allProjets);
                return;
            }

            // Appliquer un filtre de date si dateFilter est fourni
            let filteredProjets = allProjets.filter(projet => {
                if (dateFilter.start && dateFilter.end) {
                    const projetDate = new Date(projet.date);
                    return projetDate >= new Date(dateFilter.start) && projetDate <= new Date(dateFilter.end);
                }
                return true;
            });

            // Projets en cours / terminés
            this.state.projetsEnCours = filteredProjets.filter(p => p.pourcentage_avancement < 1);
            this.state.projetsTermines = filteredProjets.filter(p => p.pourcentage_avancement >= 1);

            // Filtrage par plan
            if (selectedPlan === "plans_data") {
                // Graphique = Totaux des plans
                this.state.projetsData = this.state.plansData.map(plan => ({
                    code: plan.name,
                    value: plan[selectedData],
                    id: plan.id,
                }));
            }
            else if (selectedPlan === "all_project_code") {
                // Tous les projets (aucun filtrage plan)
                console.log("Affichage de tous les projets sans filtrage par plan.");
                this.state.projetsData = filteredProjets.map(projet => ({
                    code: projet.code_projet,
                    value: projet[selectedData],
                    id: projet.id_code_project,
                }));
            }
            else if (selectedPlan) {
                // Filtrer par plan_id
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
                // Pas de plan sélectionné => On affiche la liste des plans sous forme d'objets
                this.state.projetsData = this.state.plansData.map(plan => ({
                    code: plan.name,
                    value: plan[selectedData],
                }));
            }

            // Mettre à jour le tableau des projets
            this.state.projetsTerminesCount = this.state.projetsTermines.length;
            this.state.projetsEnCoursCount = this.state.projetsEnCours.length;

            const tableBody = document.getElementById('projects-table-body');
            tableBody.innerHTML = '';

            // Injection des lignes
            filteredProjets.forEach(projet => {
                const row = document.createElement('tr');

                const codeProjetCell = document.createElement('td');
                const codeProjetText = document.createElement('h6');
                codeProjetText.classList.add('text-sm');
                codeProjetText.textContent = projet.code_projet;
                codeProjetCell.appendChild(codeProjetText);
                row.appendChild(codeProjetCell);

                const budgetCell = document.createElement('td');
                budgetCell.classList.add('text-center');
                budgetCell.textContent = projet.ca_final ? Math.round(projet.ca_final).toLocaleString() : '0';
                row.appendChild(budgetCell);

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

                // Clic sur la ligne => naviguer
                row.addEventListener('click', () => {
                    this.navigateToProjet(projet.id_code_project, projet.code_projet);
                });

                tableBody.appendChild(row);
            });

            // Générer le graphique
            this.generateChart(selectedData);

        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

    // ===========================================================
    // ================= Génération du graphique =================
    // ===========================================================
    generateChart(selectedDataLabel = "Résultat Chantier (CFA)") {
        const ctx = document.getElementById('ResultatChart').getContext('2d');
        const noDataMessage = document.getElementById('noDataMessage');

        // Si un graphique existait, on le détruit
        if (this.chart) {
            this.chart.destroy();
        }

        // S'il n'y a pas de data
        if (!this.state.projetsData || !this.state.projetsData.length) {
            noDataMessage.style.display = 'block';
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        // Filtrer les projets de valeur nulle
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
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Projets Terminés',
            res_model: 'analytic.dashboard',
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
            domain: [['pourcentage_avancement_stored', '<', 1]],
        });
    }

    showOngoingProjects() {
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