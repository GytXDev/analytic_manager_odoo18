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
        projetsTermines: []
    });

    setup() {
        this.action = useService("action");

        onMounted(async () => {
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

        periodSelector.addEventListener('change', () => {
            if (periodSelector.value === 'custom') {
                dateRangeDiv.classList.remove('hidden');
            } else {
                dateRangeDiv.classList.add('hidden');
                // Chargez les projets pour le mois sélectionné
                this.loadProjets(); // Vous pouvez aussi passer le filtre ici
            }
        });

        // Gestion du bouton Appliquer
        const applyButton = document.querySelector('.btn-submit');
        applyButton.addEventListener('click', async () => {
            const startDate = document.getElementById('start-date').value;
            const endDate = document.getElementById('end-date').value;

            let dateFilter = {};
            if (periodSelector.value === 'last-month') {
                const today = new Date();
                const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                dateFilter = {
                    start: lastMonthStart.toISOString().split('T')[0],
                    end: lastMonthEnd.toISOString().split('T')[0]
                };
            } else if (periodSelector.value === 'this-month') {
                const today = new Date();
                const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                dateFilter = {
                    start: thisMonthStart.toISOString().split('T')[0],
                    end: thisMonthEnd.toISOString().split('T')[0]
                };
            } else if (periodSelector.value === 'custom' && startDate && endDate) {
                dateFilter = {
                    start: startDate,
                    end: endDate
                };
            }

            // Appeler les méthodes de chargement
            await this.loadProjets(dateFilter);
            await this.loadResultatChantierTotal(dateFilter);
            await this.loadProgressionMoyenne(dateFilter);
        });
    }

    async loadResultatChantierTotal(dateFilter = {}) {
        try {
            const result = await rpc('/dashboard/resultat_chantier_total', dateFilter);
            const total = result?.resultat_chantier_total || 0;
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
            const response = await rpc('/dashboard/liste_plans', {});  // Appel API
            console.log("Réponse API reçue :", response);

            // Vérifier si les données sont présentes
            if (!response || response.status !== "success" || !response.data || !response.data.plans) {
                console.error("Aucun plan trouvé ou réponse invalide :", response);
                return;
            }

            const plans = response.data.plans;  // Récupérer les plans à partir de response.data
            const planSelect = document.getElementById('planSelect');

            planSelect.innerHTML = ''; // Vider les options existantes

            // Ajouter une option par défaut
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "Sélectionnez une Exploitation";
            defaultOption.disabled = true;
            defaultOption.selected = true;
            planSelect.appendChild(defaultOption);

            const allPlansOption = document.createElement('option');
            allPlansOption.value = "";
            allPlansOption.textContent = "Toutes les exploitations";
            planSelect.appendChild(allPlansOption);

            // Ajouter les options dynamiquement
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id;  // Assure-toi que l'ID du plan est bien la valeur de l'option
                option.textContent = plan.name;
                planSelect.appendChild(option);
            });

            console.log("Plans chargés avec succès :", plans);

            // Attacher l'événement de changement sur le select pour afficher le nom et l'ID du plan choisi
            if (planSelect) {
                planSelect.addEventListener("change", () => {
                    const selectedPlanId = planSelect.value;
                    const selectedPlan = plans.find(plan => plan.id === parseInt(selectedPlanId));

                    if (selectedPlan) {
                        console.log(`Plan sélectionné: ID = ${selectedPlan.id}, Nom = ${selectedPlan.name}`);
                    } else {
                        console.log("Aucun plan sélectionné.");
                    }

                    this.loadProjets();  // Appeler la fonction pour charger les projets en fonction du plan sélectionné
                });
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des plans :", error);
        }
    }


    // Fonction de chargement des projets avec filtre dynamique
    async loadProjets(dateFilter = {}) {
        try {
            const selectedPlan = parseInt(document.getElementById('planSelect').value);  // Conversion en entier
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

                // Afficher les plan_id des projets dans la console
                filteredProjets.forEach(projet => {
                    console.log(projet.plan_id); // Afficher le plan_id pour chaque projet
                });

                this.state.projetsEnCours = filteredProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = filteredProjets.filter(projet => projet.pourcentage_avancement >= 1);

                // Si aucun plan n'est sélectionné (Tous les plans), ne pas filtrer
                if (selectedPlan) {
                    filteredProjets = filteredProjets.filter(projet => projet.plan_id === selectedPlan);
                    console.log("Filtrage par plan ID : ", selectedPlan);
                } else {
                    console.log("Affichage de tous les projets sans filtrage par plan.");
                }

                // Mettre à jour projetsData pour le graphique
                this.state.projetsData = filteredProjets.map(projet => ({
                    code: projet.code_projet,
                    value: projet[selectedData],
                    id: projet.id_code_project,
                }));

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


    generateChart(selectedDataLabel = "Résultat Chantier (CFA)") {
        const ctx = document.getElementById('ResultatChart').getContext('2d');

        if (this.chart) {
            this.chart.destroy();
        }

        if (!this.state.projetsData || !this.state.projetsData.length) {
            console.error("Pas de données valides pour générer le graphique !");
            return;
        }

        // Filtrer les projets avec des valeurs non nulles
        const filteredProjets = this.state.projetsData.filter(projet => projet.value > 0);
        if (!filteredProjets.length) {
            console.error("Aucun projet avec des valeurs valides !");
            return;
        }

        const labels = filteredProjets.map(projet => projet.code);
        const data = filteredProjets.map(projet => projet.value);
        const ids = filteredProjets.map(projet => projet.id);

        const backgroundColors = [
            '#42A5F5', '#66BB6A', '#FFA726', '#FF7043', '#8D6E63',
            '#AB47BC', '#26C6DA', '#FFEE58', '#D4E157', '#EC407A',
            '#7E57C2', '#5C6BC0', '#26A69A', '#8D6E63', '#78909C',
            '#FFCA28', '#29B6F6', '#EF5350', '#9CCC65', '#FF5722'
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
                        this.navigateToProjet(projetId, labels[firstPoint.index]);
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const projetIndex = context.dataIndex;
                                return `Code Projet: ${labels[projetIndex]}, Valeur: ${context.raw.toLocaleString()} CFA`;
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


    // Méthode pour naviguer vers un projet spécifique
    navigateToProjet(projetId, projetCode) {
        this.action.doAction({
            type: 'ir.actions.act_window',
            name: `Détails du projet ${projetCode}`, // Utilisation du code du projet
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
