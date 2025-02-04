// Fonction pour charger les plans analytiques
    async loadPlans() {
        try {
            const response = await rpc('/dashboard/liste_plans', {});  // Appel API

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

                this.state.projetsEnCours = filteredProjets.filter(projet => projet.pourcentage_avancement < 1);
                this.state.projetsTermines = filteredProjets.filter(projet => projet.pourcentage_avancement >= 1);

                // Si aucun plan n'est sélectionné (Tous les plans), ne pas filtrer
                if (selectedPlan) {
                    filteredProjets = filteredProjets.filter(projet => projet.plan_id === selectedPlan);
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
        const noDataMessage = document.getElementById('noDataMessage');

        if (this.chart) {
            this.chart.destroy();
        }

        if (!this.state.projetsData || !this.state.projetsData.length) {
            noDataMessage.style.display = 'block'; // Afficher le message
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        // Filtrer les projets avec des valeurs non nulles
        const filteredProjets = this.state.projetsData.filter(projet => projet.value > 0);
        if (!filteredProjets.length) {
            noDataMessage.style.display = 'block'; // Afficher le message
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            return;
        }

        noDataMessage.style.display = 'none'; // Cacher le message si des données sont présentes

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

    je ne veux pas tant que ça les pourcentage mon besoin est que lorsque l'on clique sur toutes les exploitations que l'on ai exemple, plan libreville tant de resultat chantier, donc le cumule des resultats des codes projet regroupes pour chaque plan 