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
            const plans = await rpc('/dashboard/liste_plans', {}); 
            const planSelect = document.getElementById('planSelect');
            planSelect.innerHTML = ''; 
            plans.forEach(plan => {
                const option = document.createElement('option');
                option.value = plan.id; 
                option.textContent = plan.name; 
                planSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Erreur lors de la récupération des plans :", error);
        }
    }

    // Fonction de chargement des projets avec filtre dynamique
    async loadProjets(dateFilter = {}) {
        try {
            const allProjets = await rpc('/dashboard/liste_projets', {});
            if (Array.isArray(allProjets)) {
                // Filtrer par période si un filtre est fourni
                const filteredProjets = allProjets.filter(projet => {
                    const projetDate = new Date(projet.date);
                    if (dateFilter.start && dateFilter.end) {
                        return projetDate >= new Date(dateFilter.start) && projetDate <= new Date(dateFilter.end);
                    }
                    return true; // Pas de filtre
                });

                this.state.projetsEnCours = filteredProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = filteredProjets.filter(projet => projet.pourcentage_avancement >= 1);

                // Mettre à jour projetsData pour le graphique
                this.state.projetsData = filteredProjets.map(projet => ({
                    code: projet.code_projet,
                    resultChantier: projet.resultat_chantier_cumule,
                    id: projet.id_code_project, // Ajout de l'ID dans les données pour le graphique
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
                this.generateChart();

            } else {
                console.error("La réponse n'est pas un tableau :", allProjets);
            }
        } catch (error) {
            console.error("Erreur lors de la récupération des projets:", error);
        }
    }

    generateChart() {
        const ctx = document.getElementById('ResultatChart').getContext('2d');

        // Vérifiez si un graphique existe déjà
        if (this.chart) {
            this.chart.destroy(); // Détruire le graphique existant
        }

        if (!this.state.projetsData || !this.state.projetsData.length) {
            console.error("Pas de données valides pour générer le graphique !");
            return;
        }

        // Filtrer les projets avec des résultats non nuls
        const filteredProjets = this.state.projetsData.filter(projet => projet.resultChantier > 0);
        if (!filteredProjets.length) {
            console.error("Aucun projet avec des résultats valides !");
            return;
        }

        const labels = filteredProjets.map(projet => projet.code);
        const data = filteredProjets.map(projet => projet.resultChantier);
        const ids = filteredProjets.map(projet => projet.id); // Récupérer les IDs des projets

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
                    label: 'Résultat Chantier (CFA)',
                    data: data,
                    backgroundColor: backgroundColors.slice(0, data.length), // Ajuster les couleurs pour correspondre aux données
                }],
            },
            options: {
                responsive: true,
                onClick: (event) => {
                    const activePoints = this.chart.getElementsAtEventForMode(event, 'nearest', { intersect: true }, true);
                    if (activePoints.length) {
                        const firstPoint = activePoints[0];
                        const projetId = ids[firstPoint.index]; // Utiliser l'ID du projet
                        this.navigateToProjet(projetId, labels[firstPoint.index]); // Passer aussi le code du projet
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const projetIndex = context.dataIndex; // Récupérer l'index du projet
                                return `Code Projet: ${labels[projetIndex]}, Résultat Chantier: ${context.raw.toLocaleString()} CFA`;
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
