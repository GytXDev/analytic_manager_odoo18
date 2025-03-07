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

        // Gestionnaire d'événement pour le clic du bouton
        this.onClickUpdateDashboard = async () => {
            try {
                const result = await rpc('/dashboard/update_dashboard', {});
            } catch (error) {
                console.error("Erreur lors de l'appel RPC :", error);
            }
        };

        onMounted(async () => {
            await this.onClickUpdateDashboard();
            await this.loadResultatChantierTotal();
            await this.loadProgressionMoyenne();
            await this.loadStatistiquesProjets();
            await this.loadProjets();
            await this.loadPlans();
            this.generateChart();
            this._eventListenersChart();

            // Clic pour les projets terminés
            const completedProjectsCard = document.getElementById('completed-projects-card');
            completedProjectsCard.addEventListener('click', () => {
                this.showCompletedProjects();
            });

            // Ajout de l'événement de clic pour les projets en cours
            const ongoingProjectsCard = document.getElementById('ongoing-projects-card');
            ongoingProjectsCard.addEventListener('click', () => {
                this.showOngoingProjects();
            });

        });
    }

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

        // Fonction de recherche dynamique sur le champ de saisie
        document.getElementById('search-project-code').addEventListener('input', (event) => {
            const searchTerm = event.target.value.toLowerCase(); // Récupérer le texte de recherche en minuscule

            // Filtrer les projets en fonction du code projet
            const filteredProjets = this.state.projetsEnCours.concat(this.state.projetsTermines).filter(projet =>
                projet.code_projet.toLowerCase().includes(searchTerm) // Filtrer sur le code projet
            );

            // Mettre à jour dynamiquement le tableau avec les projets filtrés
            const tableBody = document.getElementById('projects-table-body');
            tableBody.innerHTML = ''; // Vider le tableau existant

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
                progressBar.style.width = `${projet.pourcentage_avancement * 100}%`;

                progressBarContainer.appendChild(progressBar);
                progressWrapper.appendChild(progressBarContainer);

                const progressText = document.createElement('small');
                progressText.textContent = `${(projet.pourcentage_avancement * 100).toFixed(0)}%`;
                progressWrapper.appendChild(progressText);

                progressCell.appendChild(progressWrapper);
                row.appendChild(progressCell);

                // Ajout du gestionnaire de clic sur la ligne
                row.addEventListener('click', () => {
                    this.navigateToProjet(projet.code_projet);
                });

                tableBody.appendChild(row);
            });
        });

        // Gestion du sélecteur de période
        const periodSelector = document.getElementById('period-selector');
        const dateRangeDiv = document.getElementById('date-range');
        const periodLabel = document.getElementById('period-label');
        const applyButton = document.querySelector('.btn-submit');

        // 🗓️ Charger par défaut les résultats du mois en cours
        const today = new Date();
        const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const defaultDateFilter = {
            start: thisMonthStart.toISOString().split('T')[0],
            end: thisMonthEnd.toISOString().split('T')[0]
        };

        periodSelector.value = 'this-year'; // Sélection par défaut
        periodLabel.textContent = "de l'année en cours";

        // Chargement initial des données
        this.loadProjets(defaultDateFilter);
        this.loadResultatChantierTotal(defaultDateFilter);
        this.loadProgressionMoyenne(defaultDateFilter);

        // 🎯 Gestion du sélecteur de période
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

                // Rechargement des données pour la période sélectionnée
                this.applyDateFilter();
            }
        });

        // 🗓️ Gestion du bouton Appliquer pour la période personnalisée
        applyButton.addEventListener('click', () => this.applyDateFilter());
    }

    // 🔄 Fonction pour appliquer le filtre en fonction de la période sélectionnée
    applyDateFilter() {
        const periodSelector = document.getElementById('period-selector');
        const periodLabel = document.getElementById('period-label');
        const startDate = document.getElementById('start-date')?.value;
        const endDate = document.getElementById('end-date')?.value;
        const today = new Date();
        const dateFilter = {
            start: currentYearStart.toISOString().split('T')[0],
            end: currentYearEnd.toISOString().split('T')[0]
        };

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
            dateFilter = {
                start: startDate,
                end: endDate
            };
            periodLabel.textContent = `du ${startDate} au ${endDate}`;
        }

        // 📊 Rechargement des données
        this.loadProjets(dateFilter);
        this.loadResultatChantierTotal(dateFilter);
        this.loadProgressionMoyenne(dateFilter);
    }


    async loadResultatChantierTotal(dateFilter = {}) {
        try {
            const result = await rpc('/dashboard/resultat_chantier_total', dateFilter);
            const total = Math.round(result?.resultat_chantier_total || 0); // Arrondi à l'entier le plus proche
            this.state.resultatChantierTotal = total.toLocaleString();
        } catch (error) {
            console.error("Erreur lors de la récupération du résultat chantier total :", error);
        }
    }

    async loadProgressionMoyenne(dateFilter = {}) {
        try {
            const result = await rpc('/dashboard/progression_moyenne', dateFilter);
            let progression = result?.progression_moyenne || 0;

            if (typeof progression === 'number' && !isNaN(progression)) {
                this.state.progressionMoyenne = (progression * 100).toFixed(2); // En pourcentage
            } else {
                this.state.progressionMoyenne = '0.00'; // Valeur par défaut si progression invalide
                console.error("Progression moyenne invalide:", progression);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération de la progression moyenne :", error);
            this.state.progressionMoyenne = '0.00'; // Valeur par défaut en cas d'erreur
        }
    }

    async loadStatistiquesProjets() {
        try {
            const result = await rpc('/dashboard/statistiques_projets', {});
            this.state.statistiquesProjets = result || {};
        } catch (error) {
            console.error("Erreur lors de la récupération des statistiques des projets :", error);
        }
    }

    // Fonction pour charger les plans analytiques
    async loadPlans() {
        try {
            const response = await rpc('/dashboard/liste_plans', {});

            if (!response || response.status !== "success" || !response.data || !response.data.plans) {
                console.error("Aucun plan trouvé ou réponse invalide :", response);
                return;
            }

            const plans = response.data.plans;
            const planSelect = document.getElementById('planSelect');
            planSelect.innerHTML = '';

            // Ajouter une option par défaut
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "Sélectionnez une Exploitation";
            defaultOption.disabled = true;
            planSelect.appendChild(defaultOption);

            // Option pour afficher toutes les exploitations
            const plansDataOption = document.createElement('option');
            plansDataOption.value = "plans_data";
            plansDataOption.textContent = "Toutes les exploitations";
            planSelect.appendChild(plansDataOption);

            // Option pour afficher tous les codes projets
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

            // Stocker les plans
            this.state.plansData = plans;

            // Attacher l'événement change
            if (planSelect) {
                planSelect.addEventListener("change", () => {
                    const selectedPlanId = planSelect.value;

                    if (selectedPlanId === "plans_data") {
                        console.log("Navigation vers les données des plans.");
                    } else if (selectedPlanId === "all_project_code") {
                        console.log("Affichage de tous les projets.");
                    } else {
                        console.log(`Plan sélectionné: ID = ${selectedPlanId}`);
                    }

                    this.loadProjets();
                });
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des plans :", error);
        }
    }

    // Fonction de chargement des projets avec filtre dynamique
    async loadProjets(dateFilter = {}) {
        try {
            const selectedPlan = document.getElementById('planSelect').value;  // Utiliser la valeur sélectionnée
            const selectedData = document.getElementById('dataSelect').value || "resultat_chantier_cumule";

            const allProjets = await rpc('/dashboard/liste_projets', {});

            if (Array.isArray(allProjets)) {

                // Filtrer par période si un filtre est fourni
                let filteredProjets = allProjets.filter(projet => {
                    const projetDate = new Date(projet.date);
                    if (dateFilter.start && dateFilter.end) {
                        return projetDate >= new Date(dateFilter.start) && projetDate <= new Date(dateFilter.end);
                    }
                    return true; // Pas de filtre
                });

                this.state.projetsEnCours = filteredProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = filteredProjets.filter(projet => projet.pourcentage_avancement >= 1);

                // Si l'option "Données des plans" est sélectionnée
                if (selectedPlan === "plans_data") {
                    // Utiliser les valeurs totales des plans depuis l'état
                    this.state.projetsData = this.state.plansData.map(plan => ({
                        code: plan.name,
                        value: plan[selectedData],
                        id: plan.id,
                    }));
                }
                else if (selectedPlan == "all_project_code") {
                    console.log("Affichage de tous les projets sans filtrage par plan.");
                    // Mettre à jour projetsData pour le graphique
                    this.state.projetsData = filteredProjets.map(projet => ({
                        code: projet.code_projet,
                        value: projet[selectedData],
                        id: projet.id_code_project,
                    }));

                } else if (selectedPlan) {
                    // Filtrer par plan sélectionné
                    filteredProjets = filteredProjets.filter(projet => projet.plan_id === parseInt(selectedPlan));
                    // Mettre à jour projetsData pour le graphique
                    this.state.projetsData = filteredProjets.map(projet => ({
                        code: projet.code_projet,
                        value: projet[selectedData],
                        id: projet.id_code_project,
                    }));

                } else {
                    this.state.projetsData = this.state.plansData.map(plan => ({
                        code: plan.name,
                        value: plan[selectedData],
                    }));
                }

                // Compter les projets
                this.state.projetsTerminesCount = this.state.projetsTermines.length;
                this.state.projetsEnCoursCount = this.state.projetsEnCours.length;

                // Dynamiser le tableau des projets
                const tableBody = document.getElementById('projects-table-body');
                tableBody.innerHTML = ''; // Vider le tableau existant

                // Ajout des lignes de projets
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
                    progressBar.style.width = `${projet.pourcentage_avancement * 100}%`;

                    progressBarContainer.appendChild(progressBar);
                    progressWrapper.appendChild(progressBarContainer);

                    const progressText = document.createElement('small');
                    progressText.textContent = `${(projet.pourcentage_avancement * 100).toFixed(0)}%`;
                    progressWrapper.appendChild(progressText);

                    progressCell.appendChild(progressWrapper);
                    row.appendChild(progressCell);

                    // Ajout du gestionnaire de clic sur la ligne
                    row.addEventListener('click', () => {
                        this.navigateToProjet(projet.id_code_project, projet.code_projet); // Passer aussi le code du projet
                    });

                    tableBody.appendChild(row);
                });

                // Appeler la fonction pour générer le graphique
                this.generateChart(selectedData);

            } else {
                console.error("La réponse n'est pas un tableau :", allProjets);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

    // Mettre à jour la méthode generateChart()
    generateChart(selectedDataLabel = "Résultat Chantier (CFA)") {
        const ctx = document.getElementById('ResultatChart').getContext('2d');
        const noDataMessage = document.getElementById('noDataMessage');

        if (this.chart) {
            this.chart.destroy();
        }

        if (!this.state.projetsData || !this.state.projetsData.length) {
            noDataMessage.style.display = 'block';
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        let filteredProjets = this.state.projetsData.filter(projet => projet.value !== 0);

        if (selectedDataLabel === "Dépenses Cumulées") {
            filteredProjets = filteredProjets.map(projet => ({
                ...projet,
                value: Math.abs(projet.value)
            }));
        }

        if (!filteredProjets.length) {
            noDataMessage.style.display = 'block';
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        noDataMessage.style.display = 'none';

        const labels = filteredProjets.map(projet => projet.code);
        const data = filteredProjets.map(projet => projet.value);
        const ids = filteredProjets.map(projet => projet.id);

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
                                const projetIndex = context.dataIndex;
                                return `Code: ${labels[projetIndex]}, Valeur: ${context.raw.toLocaleString()} CFA`;
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

    // Nouvelle méthode navigateToPlan()
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

    // Méthode existante navigateToProjet() (inchangée)
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


    showCompletedProjects() {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Projets Terminés',
            res_model: 'analytic.dashboard',
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
            domain: [['pourcentage_avancement', '>=', 1]], // Filtrer pour les projets terminés
        });
    }

    showOngoingProjects() {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: 'Projets en Cours',
            res_model: 'analytic.dashboard',
            views: [[false, 'list'], [false, 'form']],
            target: 'current',
            domain: [['pourcentage_avancement', '<', 1]], // Filtrer pour les projets en cours
        });
    }
}

registry.category('actions').add('dashboard_analytic', AnalyticDashboard);
